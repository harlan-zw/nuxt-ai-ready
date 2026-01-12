import type { ParsedMarkdownResult } from './prerender'
import type { LlmsTxtConfig, ModuleOptions } from './runtime/types'
import { access, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { addPlugin, addServerHandler, createResolver, defineNuxtModule, hasNuxtModule } from '@nuxt/kit'
import defu from 'defu'
import { installNuxtSiteConfig, useSiteConfig, withSiteUrl } from 'nuxt-site-config/kit'
import { readPackageJSON } from 'pkg-types'
import { hookNuxtSeoProLicense } from './kit'
import { logger } from './logger'
import { setupPrerenderHandler } from './prerender'
import { registerTypeTemplates } from './templates'
import { refineDatabaseConfig, resolveDatabaseAdapter } from './utils/database'

export interface ModuleHooks {
  /**
   * Hook called when page markdown is generated during prerendering.
   * Called with route and markdown content when content has changed.
   */
  'ai-ready:page:markdown': (context: ParsedMarkdownResult & { route: string }) => void | Promise<void>
  /**
   * Hook to modify llms.txt configuration before it is finalized
   */
  'ai-ready:llms-txt': (payload: {
    sections: LlmsTxtConfig['sections']
    notes: string[]
  }) => void | Promise<void>
}

export interface ModulePublicRuntimeConfig {
  debug: boolean
  version: string
  mdreamOptions: ModuleOptions['mdreamOptions']
  markdownCacheHeaders: Required<NonNullable<ModuleOptions['markdownCacheHeaders']>>
  database: {
    type: 'sqlite' | 'd1' | 'libsql'
    filename?: string
    bindingName?: string
    url?: string
    authToken?: string
  }
  runtimeSync: {
    enabled: boolean
    ttl: number
    batchSize: number
    secret?: string
    pruneTtl: number
  }
  indexNow?: {
    enabled: boolean
    key?: string
    host?: string
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-ai-ready',
    compatibility: {
      nuxt: '>=4.0.0',
    },
    configKey: 'aiReady',
  },
  moduleDependencies: {
    '@nuxtjs/robots': {
      version: '>=5.6.0',
    },
    '@nuxtjs/sitemap': {
      version: '>=7',
    },
    'nuxt-site-config': {
      version: '>=3',
    },
    '@nuxtjs/mcp-toolkit': {
      version: '>=0.4.0',
      optional: true,
    },
  },
  defaults() {
    return {
      enabled: true,
      debug: false,
      mdreamOptions: {
        preset: 'minimal',
      } satisfies ModuleOptions['mdreamOptions'],
      markdownCacheHeaders: {
        maxAge: 3600, // 1 hour
        swr: true,
      },
      cacheMaxAgeSeconds: 600, // 10 minutes
    }
  },
  async setup(config, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    const { version } = await readPackageJSON(resolve('../package.json'))

    logger.level = (config.debug || nuxt.options.debug) ? 4 : 3

    if (config.enabled === false) {
      logger.debug('Module is disabled, skipping setup.')
      return
    }

    // Install site config for accessing site name and description
    await installNuxtSiteConfig()
    hookNuxtSeoProLicense()

    // Set up alias
    nuxt.options.nitro.alias = nuxt.options.nitro.alias || {}
    nuxt.options.alias['#ai-ready'] = resolve('./runtime')

    // Resolve database adapter alias at build time
    const dbType = config.database?.type || 'sqlite'
    const adapterPath = await resolveDatabaseAdapter(dbType)
    nuxt.options.alias['#ai-ready/adapter'] = adapterPath
    nuxt.options.nitro.alias['#ai-ready/adapter'] = adapterPath

    // set default MCP name
    if (!nuxt.options.mcp?.name) {
      nuxt.options.mcp = nuxt.options.mcp || {}
      nuxt.options.mcp.name = useSiteConfig().name
    }

    // Add runtime server directories to Nitro scan
    nuxt.options.nitro.scanDirs = nuxt.options.nitro.scanDirs || []
    nuxt.options.nitro.scanDirs.push(
      resolve('./runtime/server/utils'),
    )

    if (typeof config.contentSignal === 'object') {
      nuxt.options.robots = nuxt.options.robots || {}
      nuxt.options.robots.groups = nuxt.options.robots.groups || []
      nuxt.options.robots.groups.push({
        userAgent: '*',
        contentUsage: [`train-ai=${config.contentSignal.aiTrain ? 'y' : 'n'}`],
        contentSignal: [`ai-train=${config.contentSignal.aiTrain ? 'yes' : 'no'}`, `search=${config.contentSignal.search ? 'yes' : 'no'}`, `ai-input=${config.contentSignal.aiInput ? 'yes' : 'no'}`],
      })
    }

    // Register type templates for Nitro hooks and virtual modules
    registerTypeTemplates({ nuxt, config })

    // Build default llms.txt config with API endpoints
    const defaultLlmsTxtSections: LlmsTxtConfig['sections'] = []
    const llmsFullRoute = withSiteUrl('llms-full.txt')
    defaultLlmsTxtSections.push({
      title: 'LLM Resources',
      links: [
        {
          title: 'Full Content',
          href: llmsFullRoute,
          description: 'Complete page content in markdown format.',
        },
      ],
    })

    const hasMCP = hasNuxtModule('@nuxtjs/mcp-toolkit')
    if (hasMCP) {
      // Register MCP definitions from runtime directory
      nuxt.hook('mcp:definitions:paths', (paths) => {
        const mcpRuntimeDir = resolve(`./runtime/server/mcp`)
        const mcpConfig = config.mcp || {}
        if (mcpConfig.tools !== false)
          (paths.tools ||= []).push(`${mcpRuntimeDir}/tools`)
        if (mcpConfig.resources !== false)
          (paths.resources ||= []).push(`${mcpRuntimeDir}/resources`)
      })

      // Add MCP to the API endpoints section if bulk is enabled, or create new section
      const mcpLink = {
        title: 'MCP',
        href: withSiteUrl(nuxt.options.mcp?.route || '/mcp'),
        description: 'Model Context Protocol server endpoint for AI agent integration.',
      }

      if (defaultLlmsTxtSections[0]) {
        defaultLlmsTxtSections[0].links!.push(mcpLink)
      }
      else {
        defaultLlmsTxtSections.push({
          title: 'LLM Tools',
          links: [mcpLink],
        })
      }
    }

    // Merge default sections with user config
    const mergedLlmsTxt: LlmsTxtConfig = config.llmsTxt
      ? {
          sections: [
            ...defaultLlmsTxtSections,
            ...(config.llmsTxt.sections || []),
          ],
          notes: config.llmsTxt.notes,
        }
      : { sections: defaultLlmsTxtSections }

    // Allow other modules to extend llms.txt content via hook
    const llmsTxtPayload = {
      sections: mergedLlmsTxt.sections || [],
      notes: typeof mergedLlmsTxt.notes === 'string' ? [mergedLlmsTxt.notes] : (mergedLlmsTxt.notes || []),
    }
    await nuxt.callHook('ai-ready:llms-txt', llmsTxtPayload)
    mergedLlmsTxt.sections = llmsTxtPayload.sections
    mergedLlmsTxt.notes = llmsTxtPayload.notes.length > 0 ? llmsTxtPayload.notes : undefined

    const prerenderCacheDir = join(nuxt.options.rootDir, 'node_modules/.cache/nuxt-seo/ai-ready/routes')
    // Build-time database path (separate from runtime DB which may be D1/LibSQL)
    const buildDbPath = join(nuxt.options.buildDir, '.data/ai-ready/build.db')

    // Virtual module for page data
    nuxt.hooks.hook('nitro:config', (nitroConfig) => {
      // Enable async context to allow useEvent() in nested functions (MCP handlers, etc.)
      // This enables access to H3Event and Cloudflare bindings from any async context
      nitroConfig.experimental = nitroConfig.experimental || {}
      nitroConfig.experimental.asyncContext = true

      // Register scheduled task for indexing if runtimeSync enabled with cron
      const runtimeSyncEnabled = config.runtimeSync?.enabled ?? false
      const cron = config.runtimeSync?.cron
      if (runtimeSyncEnabled && cron) {
        // Enable experimental tasks API (required for scheduled tasks)
        nitroConfig.experimental.tasks = true

        nitroConfig.tasks = nitroConfig.tasks || {}
        nitroConfig.tasks['ai-ready:index'] = {
          handler: resolve('./runtime/server/tasks/ai-ready-index'),
        }

        nitroConfig.scheduledTasks = nitroConfig.scheduledTasks || {}
        nitroConfig.scheduledTasks[cron] = nitroConfig.scheduledTasks[cron] || []
        ;(nitroConfig.scheduledTasks[cron] as string[]).push('ai-ready:index')
      }

      nitroConfig.virtual = nitroConfig.virtual || {}

      // Helper to read from SQLite database during prerender
      // Uses better-sqlite3 directly since we're in Node.js context
      nitroConfig.virtual['#ai-ready-virtual/read-page-data.mjs'] = `
export async function readPageDataFromFilesystem() {
  if (!import.meta.prerender) {
    return { pages: [], errorRoutes: [] }
  }

  const dbPath = ${JSON.stringify(buildDbPath)}

  // Check if database file exists
  const { existsSync } = await import('node:fs')
  if (!existsSync(dbPath)) {
    return { pages: [], errorRoutes: [] }
  }

  // Use better-sqlite3 to read pages
  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath, { readonly: true })

  const rows = db.prepare('SELECT route, title, description, markdown, headings, keywords, updated_at, is_error FROM ai_ready_pages').all()
  db.close()

  const pages = rows.filter(r => !r.is_error).map(r => ({
    route: r.route,
    title: r.title,
    description: r.description,
    markdown: r.markdown,
    headings: r.headings,
    keywords: JSON.parse(r.keywords || '[]'),
    updatedAt: r.updated_at,
  }))
  const errorRoutes = rows.filter(r => r.is_error).map(r => r.route)

  return { pages, errorRoutes }
}
`
      // Runtime module exports empty arrays (pages read from database at runtime)
      nitroConfig.virtual['#ai-ready-virtual/page-data.mjs'] = `export const pages = []\nexport const errorRoutes = []`
    })

    // Resolve database config
    const database = refineDatabaseConfig(config.database || {}, nuxt.options.rootDir)
    const runtimeSyncEnabled = config.runtimeSync?.enabled ?? false

    // IndexNow: auto-read key from env if not configured
    const indexNowKey = config.indexNow?.key || process.env.NUXT_AI_READY_INDEXNOW_KEY
    const indexNowEnabled = !!(config.indexNow?.enabled !== false && indexNowKey)

    nuxt.options.runtimeConfig['nuxt-ai-ready'] = {
      version: version || '0.0.0',
      debug: config.debug || false,
      mdreamOptions: config.mdreamOptions || {},
      markdownCacheHeaders: defu(config.markdownCacheHeaders, {
        maxAge: 3600,
        swr: true,
      }) as Required<NonNullable<ModuleOptions['markdownCacheHeaders']>>,
      llmsTxt: mergedLlmsTxt,
      cacheMaxAgeSeconds: config.cacheMaxAgeSeconds ?? 600,
      prerenderCacheDir,
      database,
      runtimeSync: {
        enabled: runtimeSyncEnabled,
        ttl: config.runtimeSync?.ttl ?? 3600,
        batchSize: config.runtimeSync?.batchSize ?? 20,
        secret: config.runtimeSync?.secret,
        pruneTtl: config.runtimeSync?.pruneTtl ?? 0,
      },
      indexNow: indexNowEnabled
        ? {
            enabled: true,
            key: indexNowKey,
            host: config.indexNow?.host || 'api.indexnow.org',
          }
        : undefined,
    } as any

    // Register plugins
    nuxt.options.nitro.plugins = nuxt.options.nitro.plugins || []
    // db-restore: loads compressed dump on cold start for serverless
    nuxt.options.nitro.plugins.push(resolve('./runtime/server/plugins/db-restore'))
    // sitemap-seeder: seeds routes from sitemap on first request (only if runtimeSync enabled)
    if (runtimeSyncEnabled)
      nuxt.options.nitro.plugins.push(resolve('./runtime/server/plugins/sitemap-seeder'))

    addServerHandler({
      middleware: true,
      handler: resolve('./runtime/server/middleware/markdown.prerender'),
    })
    addServerHandler({
      middleware: true,
      handler: resolve('./runtime/server/middleware/markdown'),
    })

    if (nuxt.options.build) {
      addPlugin({
        mode: 'server',
        src: resolve('./runtime/app/plugins/md-hints.prerender'),
      })
    }
    // gets replaced with a static file
    addServerHandler({ route: '/llms.txt', handler: resolve('./runtime/server/routes/llms.txt.get') })
    addServerHandler({ route: '/llms-full.txt', handler: resolve('./runtime/server/routes/llms-full.txt.get') })

    // Debug endpoint (only accessible when debug: true)
    if (config.debug) {
      addServerHandler({ route: '/__ai-ready-debug', handler: resolve('./runtime/server/routes/__ai-ready-debug.get') })
    }

    // Indexing control endpoints (only if runtimeSync enabled)
    if (runtimeSyncEnabled) {
      addServerHandler({ route: '/__ai-ready/status', handler: resolve('./runtime/server/routes/__ai-ready/status.get') })
      addServerHandler({ route: '/__ai-ready/poll', method: 'post', handler: resolve('./runtime/server/routes/__ai-ready/poll.post') })
      addServerHandler({ route: '/__ai-ready/prune', method: 'post', handler: resolve('./runtime/server/routes/__ai-ready/prune.post') })
    }

    // IndexNow endpoints (only if enabled with key)
    if (indexNowEnabled && indexNowKey) {
      // Key verification route: /{key}.txt
      addServerHandler({ route: `/${indexNowKey}.txt`, handler: resolve('./runtime/server/routes/indexnow-key.get') })
      // Sync endpoint
      addServerHandler({ route: '/__ai-ready/indexnow', method: 'post', handler: resolve('./runtime/server/routes/__ai-ready/indexnow.post') })
      // Status endpoint needed for IndexNow stats (may not have runtimeSync)
      if (!runtimeSyncEnabled) {
        addServerHandler({ route: '/__ai-ready/status', handler: resolve('./runtime/server/routes/__ai-ready/status.get') })
      }
    }

    // Setup prerendering hooks for static generation
    // @ts-expect-error untyped
    const isStatic = nuxt.options.nitro.static || nuxt.options._generate || false
    const hasPrerenderedRoutes = nuxt.options.nitro.prerender?.routes?.length
    const isSPA = nuxt.options.ssr === false

    if (!nuxt.options.dev && !nuxt.options._prepare) {
      // Warn about unsupported/limited modes
      if (isSPA && !hasPrerenderedRoutes) {
        logger.warn('SPA mode detected without prerendering. llms-full.txt will not be generated.')
        logger.warn('For full functionality, enable SSR or prerender routes.')
      }
      else if (!isStatic && !hasPrerenderedRoutes) {
        logger.info('SSR-only mode: llms-full.txt requires prerendering. Runtime markdown conversion available.')
      }
    }

    if (isStatic || hasPrerenderedRoutes) {
      const siteConfig = useSiteConfig()
      setupPrerenderHandler(buildDbPath, {
        name: siteConfig.name,
        url: siteConfig.url,
        description: siteConfig.description,
      }, mergedLlmsTxt)
    }

    // Add route rules for static files with proper charset
    nuxt.options.nitro.routeRules = nuxt.options.nitro.routeRules || {}
    nuxt.options.nitro.routeRules['/llms.txt'] = { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    nuxt.options.nitro.routeRules['/llms-full.txt'] = { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }

    // Append charset header for .md files to _headers (Cloudflare Pages)
    // The splat (*) greedily matches all characters including slashes, so /*.md matches all depths
    nuxt.hooks.hook('nitro:build:before', (nitro) => {
      nitro.hooks.hook('compiled', async () => {
        const headersPath = join(nitro.options.output.publicDir, '_headers')
        const exists = await access(headersPath).then(() => true).catch(() => false)
        if (exists) {
          await appendFile(headersPath, `
/*.md
  Content-Type: text/markdown; charset=utf-8
`)
          logger.debug('Appended .md charset header to _headers')
        }
      })
    })
  },
})

export type { ModuleOptions } from './runtime/types'
