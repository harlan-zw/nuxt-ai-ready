import type { ParsedMarkdownResult } from './prerender'
import type { LlmsTxtConfig, ModuleOptions } from './runtime/types'
import { createHash, randomBytes } from 'node:crypto'
import { access, appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { addPlugin, addServerHandler, addServerPlugin, createResolver, defineNuxtModule, hasNuxtModule } from '@nuxt/kit'
import defu from 'defu'
import { installNuxtSiteConfig, useSiteConfig, withSiteUrl } from 'nuxt-site-config/kit'
import { setupDevToolsUI } from 'nuxtseo-shared/devtools'
import { readPackageJSON } from 'pkg-types'
import { hookNuxtSeoProLicense } from './kit'
import { logger } from './logger'
import { setupPrerenderHandler } from './prerender'
import { registerTypeTemplates } from './templates'
import { refineDatabaseConfig } from './utils/database'

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

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'ai-ready:page:markdown': ModuleHooks['ai-ready:page:markdown']
    'ai-ready:llms-txt': ModuleHooks['ai-ready:llms-txt']
  }
}

export interface ModulePublicRuntimeConfig {
  debug: boolean
  debugCron: boolean
  version: string
  mdreamOptions: ModuleOptions['mdreamOptions']
  markdownCacheHeaders: Required<NonNullable<ModuleOptions['markdownCacheHeaders']>>
  database: {
    type: 'sqlite' | 'bun' | 'd1' | 'libsql' | 'neon'
    filename?: string
    bindingName?: string
    url?: string
    authToken?: string
  }
  runtimeSync: {
    enabled: boolean
    ttl: number
    batchSize: number
    pruneTtl: number
  }
  runtimeSyncSecret?: string
  indexNow?: string
  sitemapPrerendered: boolean
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
      version: '>=3.2',
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
        minimal: true,
        clean: true,
      } satisfies ModuleOptions['mdreamOptions'],
      markdownCacheHeaders: {
        maxAge: 3600, // 1 hour
        swr: true,
      },
      llmsTxtCacheSeconds: 600, // 10 minutes
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

    // Auto-detect database type based on deployment preset
    const preset = String(nuxt.options.nitro.preset || '')
    const isCloudflare = preset.startsWith('cloudflare')
    const isVercel = preset === 'vercel' || preset === 'vercel-edge'
    const isVercelEdge = preset === 'vercel-edge'
    const isBun = preset === 'bun'

    // Check for Postgres env vars (Vercel Postgres sets POSTGRES_URL)
    const hasPostgresUrl = !!(process.env.POSTGRES_URL || process.env.DATABASE_URL || config.database?.url)

    let dbType = config.database?.type
    if (!dbType) {
      if (isCloudflare) {
        dbType = 'd1'
        logger.debug(`Auto-detected Cloudflare preset "${preset}", using D1 database`)
      }
      else if (isVercel && hasPostgresUrl) {
        // Vercel with Postgres URL - use Neon serverless (works on both serverless & edge)
        dbType = 'neon'
        logger.debug(`Auto-detected Vercel preset with POSTGRES_URL, using Neon serverless driver`)
      }
      else if (isVercelEdge) {
        // Vercel Edge without Postgres - warn user
        logger.warn(`Vercel Edge has no filesystem. Set POSTGRES_URL (Vercel Postgres) or configure database.type: 'libsql' for full functionality.`)
        dbType = 'neon' // Will fail at runtime with helpful error if no URL
      }
      else if (isBun) {
        dbType = 'bun'
        logger.debug(`Auto-detected Bun preset, using bun:sqlite driver`)
      }
      else {
        dbType = 'sqlite'
      }
    }
    // Database type is passed to runtime config - the drizzle client handles provider selection

    // set default MCP name
    if (nuxt.options.mcp !== false && !nuxt.options.mcp?.name) {
      nuxt.options.mcp = nuxt.options.mcp || {} as Record<string, unknown>
      ;(nuxt.options.mcp as Record<string, unknown>).name = useSiteConfig().name
    }

    // Add runtime server directories to Nitro scan
    nuxt.options.nitro.scanDirs = nuxt.options.nitro.scanDirs || []
    nuxt.options.nitro.scanDirs.push(
      resolve('./runtime/server/utils'),
    )

    if (typeof config.contentSignal === 'object') {
      const robotsOpts = (nuxt.options.robots !== false ? nuxt.options.robots : {}) as Record<string, unknown>
      nuxt.options.robots = robotsOpts as unknown as typeof nuxt.options.robots
      const groups = (robotsOpts.groups || []) as Array<Record<string, unknown>>
      robotsOpts.groups = groups
      groups.push({
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
      nuxt.hook('mcp:definitions:paths' as any, (paths: Record<string, string[]>) => {
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
        href: withSiteUrl((nuxt.options.mcp !== false && nuxt.options.mcp?.route) || '/mcp'),
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
    await nuxt.callHook('ai-ready:llms-txt' as any, llmsTxtPayload)
    mergedLlmsTxt.sections = llmsTxtPayload.sections
    mergedLlmsTxt.notes = llmsTxtPayload.notes.length > 0 ? llmsTxtPayload.notes : undefined

    const prerenderCacheDir = join(nuxt.options.rootDir, 'node_modules/.cache/nuxt-seo/ai-ready/routes')
    // Build-time database path (separate from runtime DB which may be D1/LibSQL)
    const buildDbPath = join(nuxt.options.buildDir, '.data/ai-ready/build.db')

    // Resolve runtimeSync config early (needed for secret generation before nitro:config)
    const runtimeSyncConfig = typeof config.runtimeSync === 'object' ? config.runtimeSync : {}
    const runtimeSyncEnabled = !!config.runtimeSync || !!config.cron

    // IndexNow: auto-read key from env, derive from site URL if true
    const indexNow = config.indexNow === true
      ? createHash('sha256').update(useSiteConfig().url || 'nuxt-ai-ready').digest('hex').slice(0, 32)
      : config.indexNow || process.env.NUXT_AI_READY_INDEX_NOW_KEY

    // Detect if sitemap is prerendered (zeroRuntime mode, route rules, or nuxi generate)
    const sitemapConfig = nuxt.options.sitemap as { zeroRuntime?: boolean } | undefined
    const sitemapRouteRule = nuxt.options.nitro?.routeRules?.['/sitemap.xml'] as { prerender?: boolean } | undefined
    const sitemapPrerendered = !!(
      sitemapConfig?.zeroRuntime
      || sitemapRouteRule?.prerender
      || process.argv.includes('generate')
      || process.env.NUXT_GENERATE === 'true'
    )

    // Auto-derive runtimeSyncSecret: explicit config > env > license key > random
    const license = (nuxt.options.runtimeConfig.seoProKey as string | undefined) || process.env.NUXT_SEO_PRO_KEY
    let runtimeSyncSecret = config.runtimeSyncSecret || process.env.NUXT_AI_READY_RUNTIME_SYNC_SECRET
    if (!runtimeSyncSecret && runtimeSyncEnabled) {
      if (license) {
        runtimeSyncSecret = license
      }
      else {
        runtimeSyncSecret = randomBytes(32).toString('hex')
        if (!nuxt.options.dev && !nuxt.options._prepare)
          logger.info(`Generated runtimeSyncSecret (use NUXT_AI_READY_RUNTIME_SYNC_SECRET env to set explicitly)`)
      }
    }

    // Write secret to cache for CLI access
    if (runtimeSyncSecret) {
      const cacheDir = join(nuxt.options.rootDir, 'node_modules/.cache/nuxt/ai-ready')
      logger.debug(`Creating cache directory for secret: ${cacheDir}`)
      await mkdir(cacheDir, { recursive: true })
      logger.debug(`Writing runtimeSyncSecret to cache`)
      await writeFile(join(cacheDir, 'secret'), runtimeSyncSecret)
    }

    // Virtual module for page data
    nuxt.hooks.hook('nitro:config', (nitroConfig) => {
      // Enable async context to allow useEvent() in nested functions (MCP handlers, etc.)
      // This enables access to H3Event and Cloudflare bindings from any async context
      nitroConfig.experimental = nitroConfig.experimental || {}
      nitroConfig.experimental.asyncContext = true

      // mdream uses NAPI-RS native binaries on Node.js, WASM on edge runtimes.
      // For Node.js presets, externalize mdream so createRequire can find the native .node binary.
      // For edge presets (Cloudflare, Vercel Edge, Deno), export conditions auto-resolve to WASM.
      const preset = String(nitroConfig.preset || '')
      const isEdgePreset = ['cloudflare', 'vercel-edge', 'netlify-edge', 'deno'].some(p => preset.startsWith(p))
      if (!isEdgePreset) {
        nitroConfig.externals = nitroConfig.externals || {}
        nitroConfig.externals.external = nitroConfig.externals.external || []
        ;(nitroConfig.externals.external as string[]).push('mdream')
      }

      // Register scheduled task if cron is enabled (runs every 5 minutes)
      // Disabled in dev mode - context isn't fully available
      if (config.cron && !nuxt.options.dev) {
        const cronSchedule = '*/5 * * * *'
        const preset = String(nitroConfig.preset || '')
        const isVercel = preset === 'vercel' || preset === 'vercel-edge'
        const isCloudflarePages = preset === 'cloudflare-pages' || preset === 'cloudflare_pages'

        if (isCloudflarePages) {
          // Cloudflare Pages doesn't support scheduled tasks/triggers
          // Users should use external cron to call GET /__ai-ready/cron
          logger.warn('Cloudflare Pages does not support cron. Use external cron to call /__ai-ready/cron instead.')
        }
        else if (isVercel) {
          // Vercel uses HTTP-based crons - configure vercel.json to hit our endpoint
          // Auth uses Authorization: Bearer header (set CRON_SECRET env var on Vercel)
          nitroConfig.vercel = nitroConfig.vercel || {}
          nitroConfig.vercel.config = nitroConfig.vercel.config || {}
          nitroConfig.vercel.config.crons = nitroConfig.vercel.config.crons || []
          nitroConfig.vercel.config.crons.push({
            schedule: cronSchedule,
            path: '/__ai-ready/cron',
          })
        }
        else {
          // Native Nitro scheduled tasks (Cloudflare Workers, etc.)
          nitroConfig.experimental.tasks = true

          nitroConfig.tasks = nitroConfig.tasks || {}
          nitroConfig.tasks['ai-ready:cron'] = {
            handler: resolve('./runtime/server/tasks/ai-ready-cron'),
          }

          nitroConfig.scheduledTasks = nitroConfig.scheduledTasks || {}
          nitroConfig.scheduledTasks[cronSchedule] = nitroConfig.scheduledTasks[cronSchedule] || []
          ; (nitroConfig.scheduledTasks[cronSchedule] as string[]).push('ai-ready:cron')

          // Auto-configure Cloudflare wrangler cron triggers (Workers only)
          const isCloudflareWorkers = preset.startsWith('cloudflare')
          if (isCloudflareWorkers) {
            nitroConfig.cloudflare = nitroConfig.cloudflare || {}
            nitroConfig.cloudflare.deployConfig = true
            nitroConfig.cloudflare.wrangler = nitroConfig.cloudflare.wrangler || {}
            nitroConfig.cloudflare.wrangler.triggers = nitroConfig.cloudflare.wrangler.triggers || {}
            nitroConfig.cloudflare.wrangler.triggers.crons = nitroConfig.cloudflare.wrangler.triggers.crons || []
            if (!nitroConfig.cloudflare.wrangler.triggers.crons.includes(cronSchedule)) {
              nitroConfig.cloudflare.wrangler.triggers.crons.push(cronSchedule)
            }
          }
        }
      }

      nitroConfig.virtual = nitroConfig.virtual || {}

      // Helper to read from SQLite database during prerender
      // Uses node:sqlite or better-sqlite3 directly since we're in Node.js context
      // In dev mode, provide a stub to avoid rollup warnings about node:sqlite
      nitroConfig.virtual['#ai-ready-virtual/read-page-data.mjs'] = nuxt.options.dev
        ? `export async function readPageDataFromFilesystem() { return { pages: [], errorRoutes: [] } }`
        : `
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

  let rows = []
  const nodeVersion = Number.parseInt(process.versions.node?.split('.')[0] || '0')
  if (nodeVersion >= 22) {
    const { DatabaseSync } = await import('node' + ':sqlite')
    const db = new DatabaseSync(dbPath, { open: true })
    rows = db.prepare('SELECT route, title, description, markdown, headings, keywords, updated_at, is_error FROM ai_ready_pages').all()
    db.close()
  }
  else {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(dbPath, { readonly: true })
    rows = db.prepare('SELECT route, title, description, markdown, headings, keywords, updated_at, is_error FROM ai_ready_pages').all()
    db.close()
  }

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

      // Logger with debug level configured from module options
      nitroConfig.virtual['#ai-ready-virtual/logger.mjs'] = `
import { createConsola } from 'consola'
export const logger = createConsola({
  defaults: { tag: 'nuxt-ai-ready' },
  level: ${config.debug ? 4 : 3},
})
`

      // Database provider - tree-shakeable by aliasing to configured provider at build time
      const providerMap: Record<string, string> = {
        sqlite: '#ai-ready/server/db/drizzle/providers/sqlite',
        bun: '#ai-ready/server/db/drizzle/providers/bun',
        d1: '#ai-ready/server/db/drizzle/providers/d1',
        libsql: '#ai-ready/server/db/drizzle/providers/libsql',
        neon: '#ai-ready/server/db/drizzle/providers/neon',
      }
      const providerPath = providerMap[dbType!] || providerMap.sqlite
      nitroConfig.virtual['#ai-ready-virtual/db-provider.mjs'] = `export { createClient } from '${providerPath}'`

      // Database schema - tree-shakeable by aliasing to sqlite or postgres at build time
      const schemaPath = dbType === 'neon'
        ? '#ai-ready/server/db/schema/postgres'
        : '#ai-ready/server/db/schema/sqlite'
      nitroConfig.virtual['#ai-ready-virtual/db-schema.mjs'] = `export * from '${schemaPath}'`

      // Devtools metadata (build-time config not available in runtime config)
      nitroConfig.virtual['#ai-ready-virtual/devtools-meta.mjs'] = `export const devtoolsMeta = ${JSON.stringify({
        contentSignal: config.contentSignal || false,
        mcp: { enabled: hasMCP, tools: hasMCP && (config.mcp?.tools !== false), resources: hasMCP && (config.mcp?.resources !== false) },
        cron: !!config.cron,
      })}`
    })

    // Resolve database config
    const database = refineDatabaseConfig(config.database || {}, nuxt.options.rootDir)

    nuxt.options.runtimeConfig['nuxt-ai-ready'] = {
      version: version || '0.0.0',
      debug: config.debug || false,
      debugCron: config.debugCron || false,
      mdreamOptions: config.mdreamOptions || {},
      markdownCacheHeaders: defu(config.markdownCacheHeaders, {
        maxAge: 3600,
        swr: true,
      }) as Required<NonNullable<ModuleOptions['markdownCacheHeaders']>>,
      llmsTxt: mergedLlmsTxt,
      llmsTxtCacheSeconds: config.llmsTxtCacheSeconds ?? 600,
      prerenderCacheDir,
      database,
      runtimeSync: {
        enabled: runtimeSyncEnabled,
        ttl: runtimeSyncConfig.ttl ?? 3600,
        batchSize: runtimeSyncConfig.batchSize ?? 50,
        pruneTtl: runtimeSyncConfig.pruneTtl ?? 0,
      },
      runtimeSyncSecret,
      indexNow,
      sitemapPrerendered,
    } as any

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

    // Devtools API endpoint
    addServerHandler({ route: '/__ai-ready/devtools', handler: resolve('./runtime/server/routes/__ai-ready/devtools.get') })

    // Debug endpoint (only accessible when debug: true)
    if (config.debug) {
      addServerHandler({ route: '/__ai-ready-debug', handler: resolve('./runtime/server/routes/__ai-ready-debug.get') })
    }

    // Indexing control endpoints (only if runtimeSync enabled)
    if (runtimeSyncEnabled) {
      addServerHandler({ route: '/__ai-ready/status', handler: resolve('./runtime/server/routes/__ai-ready/status.get') })
      addServerHandler({ route: '/__ai-ready/poll', method: 'post', handler: resolve('./runtime/server/routes/__ai-ready/poll.post') })
      addServerHandler({ route: '/__ai-ready/prune', method: 'post', handler: resolve('./runtime/server/routes/__ai-ready/prune.post') })
      addServerHandler({ route: '/__ai-ready/restore', method: 'post', handler: resolve('./runtime/server/routes/__ai-ready/restore.post') })

      // Sitemap seeder plugin - hooks into @nuxtjs/sitemap to seed routes on render
      addServerPlugin(resolve('./runtime/server/plugins/sitemap-seeder'))
    }

    // IndexNow endpoints (only if key is configured)
    if (indexNow) {
      // Key verification route: /{key}.txt
      addServerHandler({ route: `/${indexNow}.txt`, handler: resolve('./runtime/server/routes/indexnow-key.get') })
      // Sync endpoint
      addServerHandler({ route: '/__ai-ready/indexnow', method: 'post', handler: resolve('./runtime/server/routes/__ai-ready/indexnow.post') })
      // Status endpoint needed for IndexNow stats (may not have runtimeSync)
      if (!runtimeSyncEnabled) {
        addServerHandler({ route: '/__ai-ready/status', handler: resolve('./runtime/server/routes/__ai-ready/status.get') })
      }
    }

    // Cron endpoint (for Vercel and other HTTP-based cron systems)
    if (config.cron && !nuxt.options.dev) {
      addServerHandler({ route: '/__ai-ready/cron', handler: resolve('./runtime/server/routes/__ai-ready/cron.get') })
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
      setupPrerenderHandler(config, buildDbPath, {
        name: siteConfig.name,
        url: siteConfig.url,
        description: siteConfig.description,
      }, mergedLlmsTxt, indexNow)
    }

    // Add lifecycle plugin to handle database connection cleanup
    addServerPlugin(resolve('./runtime/server/plugins/db-lifecycle'))

    // DevTools integration
    setupDevToolsUI({
      route: '/__nuxt-ai-ready',
      name: 'nuxt-ai-ready',
      title: 'AI Ready',
      icon: 'carbon:machine-learning-model',
    }, resolve, nuxt)

    // Add route rules for static files with proper charset
    nuxt.options.nitro.routeRules = nuxt.options.nitro.routeRules || {}
    nuxt.options.nitro.routeRules['/llms.txt'] = { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    nuxt.options.nitro.routeRules['/llms-full.txt'] = { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }

    // Append charset header for .md files to _headers (Cloudflare Pages)
    // The splat (*) greedily matches all characters including slashes, so /*.md matches all depths
    nuxt.hooks.hook('nitro:build:before', (nitro) => {
      nitro.hooks.hook('compiled', async () => {
        const headersPath = join(nitro.options.output.publicDir, '_headers')
        logger.debug(`Checking for _headers file: ${headersPath}`)
        const exists = await access(headersPath).then(() => true).catch(() => false)
        if (exists) {
          logger.debug(`Appending .md charset header to _headers`)
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
