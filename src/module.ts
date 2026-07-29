import type { ParsedMarkdownResult } from './prerender'
import type { LlmsTxtConfig, ModuleOptions } from './runtime/types'
import type { ResolvedWebMcpConfig } from './utils/webmcp'
import { createHash, randomBytes } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { addImports, addPlugin, addServerHandler, addServerPlugin, createResolver, defineNuxtModule, extendRouteRules, hasNuxtModule } from '@nuxt/kit'
import defu from 'defu'
import { installNuxtSiteConfig, useSiteConfig, withSiteUrl } from 'nuxt-site-config/kit'
import { setupDevToolsUI } from 'nuxtseo-shared/devtools'
import { resolveNuxtContentVersion } from 'nuxtseo-shared/kit'
import { readPackageJSON, resolvePackageJSON } from 'pkg-types'
import { logger } from './logger'
import { MARKDOWN_LINK_AVAILABILITY_FILE, setupPrerenderHandler } from './prerender'
import { registerTypeTemplates } from './templates'
import { refineDatabaseConfig } from './utils/database'
import { detectI18n, hasCjkLocale } from './utils/i18n'
import { hasConfiguredNuxtModule, resolveMcpToolkitState } from './utils/mcp'
import { ensureStaticHeader } from './utils/static-headers'
import { resolveWebMcpConfig } from './utils/webmcp'

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
  i18n?: {
    defaultLocale: string
    strategy: 'no_prefix' | 'prefix_except_default' | 'prefix' | 'prefix_and_default'
    locales: Array<{ code: string, hreflang: string, name?: string, nativeName?: string }>
  } | null
  ftsTokenizer?: string
}

/** Runtime config exposed to the browser, only set when WebMCP is enabled. */
export interface ModuleAppRuntimeConfig {
  webmcp: ResolvedWebMcpConfig
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
      version: '>=6.0.0',
    },
    '@nuxtjs/sitemap': {
      version: '>=8.3.0',
    },
    'nuxt-site-config': {
      version: '>=3.2',
    },
    'nuxtseo-shared': {
      version: '>=0.8.0',
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

    // --- v0 → v1 deprecation handling ---
    const rawConfig = (nuxt.options as any).aiReady || {}
    if ('cacheMaxAgeSeconds' in rawConfig) {
      logger.warn('`cacheMaxAgeSeconds` is deprecated, use `llmsTxtCacheSeconds` instead.')
      config.llmsTxtCacheSeconds ??= rawConfig.cacheMaxAgeSeconds
    }
    if (rawConfig.mdreamOptions?.preset) {
      logger.warn('`mdreamOptions.preset` is deprecated. Use `mdreamOptions: { minimal: true }` instead. See https://github.com/harlan-zw/nuxt-ai-ready/releases/tag/v1.0.0')
    }

    // Install site config for accessing site name and description
    await installNuxtSiteConfig()

    // Detect @nuxtjs/i18n / nuxt-i18n-micro and resolve runtime locale config
    const i18nConfig = await detectI18n({ autoI18n: config.autoI18n })
    if (i18nConfig) {
      logger.info(`i18n detected: ${i18nConfig.locales.length} locales (default: ${i18nConfig.defaultLocale}, strategy: ${i18nConfig.strategy})`)
    }
    const ftsTokenizer = i18nConfig && hasCjkLocale(i18nConfig)
      ? 'trigram'
      : 'unicode61 remove_diacritics 2'

    // Set up alias
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

    // The sqlite provider drives drizzle through better-sqlite3, but it's an
    // optional peer (drizzle has no node:sqlite driver), so package managers
    // won't auto-install it. Resolve it from the app now and fail fast with an
    // actionable message instead of a cryptic runtime "Cannot find package
    // 'better-sqlite3'" during indexing in production builds (#557).
    if (dbType === 'sqlite') {
      const hasBetterSqlite3 = await resolvePackageJSON('better-sqlite3', { from: nuxt.options.rootDir })
        .then(() => true)
        .catch(() => false)
      if (!hasBetterSqlite3) {
        throw new Error(
          `[nuxt-ai-ready] The SQLite database driver requires "better-sqlite3", which isn't installed. `
          + `Add it to your app: \`npm i better-sqlite3\` (or \`pnpm add\` / \`yarn add\`). `
          + `For serverless/edge deployments set \`aiReady.database.type\` to 'd1' (Cloudflare), 'neon' (Postgres), 'libsql' (Turso), or 'bun' instead.`,
        )
      }
    }

    const mcpToolkitState = resolveMcpToolkitState({
      installed: hasNuxtModule('@nuxtjs/mcp-toolkit')
        || hasConfiguredNuxtModule(nuxt.options.modules, '@nuxtjs/mcp-toolkit'),
      options: nuxt.options.mcp,
      static: nuxt.options.nitro.static === true,
      generating: (nuxt.options as typeof nuxt.options & { _generate?: boolean })._generate === true,
    })
    const mcpAvailable = mcpToolkitState._tag === 'Enabled'

    // Set the Toolkit name only when it will register a server.
    if (mcpAvailable && nuxt.options.mcp !== false && !nuxt.options.mcp?.name) {
      nuxt.options.mcp = nuxt.options.mcp || {} as Record<string, unknown>
      ;(nuxt.options.mcp as Record<string, unknown>).name = useSiteConfig().name
    }

    // Add runtime server directories to Nitro scan
    nuxt.options.nitro.scanDirs = nuxt.options.nitro.scanDirs || []
    nuxt.options.nitro.scanDirs.push(
      resolve('./runtime/server/utils'),
    )

    // Detect @nuxt/content v3 — if present, the markdown middleware will
    // prefer raw markdown source from content collections over HTML→mdream
    // conversion, eliminating round-trip lossiness for content-backed routes.
    const contentVersion = await resolveNuxtContentVersion()
    const hasNuxtContentV3 = !!(contentVersion && contentVersion.version === 3)

    if (typeof config.contentSignal === 'object') {
      // robots may be undefined (no explicit `robots` key) or `false` (disabled); fall back to {} so we can attach groups
      const robotsOpts = (nuxt.options.robots || {}) as Record<string, unknown>
      nuxt.options.robots = robotsOpts as unknown as typeof nuxt.options.robots
      const groups = (robotsOpts.groups || []) as Array<Record<string, unknown>>
      robotsOpts.groups = groups
      const group: Record<string, unknown> = {
        userAgent: '*',
        // Preserve nuxt-robots' default wildcard rule so the injected group remains valid.
        disallow: [''],
        contentSignal: [`ai-train=${config.contentSignal.aiTrain ? 'yes' : 'no'}`, `search=${config.contentSignal.search ? 'yes' : 'no'}`, `ai-input=${config.contentSignal.aiInput ? 'yes' : 'no'}`],
      }
      if (config.contentSignal.contentUsage !== false)
        group.contentUsage = [`train-ai=${config.contentSignal.aiTrain ? 'y' : 'n'}`]
      groups.push(group)
    }

    // Register type templates for Nitro hooks and virtual modules
    registerTypeTemplates({ nuxt, config })

    // Build default llms.txt config with API endpoints
    const defaultLlmsTxtSections: LlmsTxtConfig['sections'] = []
    const llmsFullRoute = withSiteUrl('llms-full.txt', { withBase: true })
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

    if (mcpAvailable) {
      // Hydrate the runtime database from build artifacts before Toolkit
      // resolves definitions for its first request.
      addServerPlugin(resolve('./runtime/server/plugins/mcp-data'))

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
        href: withSiteUrl(mcpToolkitState.route, { withBase: true }),
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
          markdownLinks: config.llmsTxt.markdownLinks ?? false,
          sections: [
            ...defaultLlmsTxtSections,
            ...(config.llmsTxt.sections || []),
          ],
          notes: config.llmsTxt.notes,
        }
      : { markdownLinks: false, sections: defaultLlmsTxtSections }

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

    // WebMCP exposes tools to in-browser agents via document.modelContext
    const webmcpResult = resolveWebMcpConfig(config.webmcp)
    if (webmcpResult._tag === 'Enabled') {
      for (const warning of webmcpResult.warnings)
        logger.warn(warning)
    }
    const webmcpConfig = webmcpResult._tag === 'Enabled' ? webmcpResult.config : null

    // IndexNow: auto-read key from env, derive from site URL if true
    const indexNow = config.indexNow === true
      ? createHash('sha256').update(useSiteConfig().url || 'nuxt-ai-ready').digest('hex').slice(0, 32)
      : config.indexNow || process.env.NUXT_AI_READY_INDEX_NOW_KEY

    nuxt.hooks.hook('nuxt-seo-pro:modules' as any, (modules: any[]) => {
      const mod = modules.find((m: any) => m.name === 'nuxt-ai-ready')
      if (mod) {
        mod.features = {
          mcp: mcpAvailable,
          webmcp: !!webmcpConfig,
          runtimeSync: runtimeSyncEnabled,
          cron: !!config.cron,
          indexNow: !!indexNow,
          database: dbType,
        }
      }
    })

    // Detect if sitemap is prerendered (zeroRuntime mode, route rules, or nuxi generate)
    const sitemapConfig = nuxt.options.sitemap as { zeroRuntime?: boolean } | undefined
    const sitemapRouteRule = nuxt.options.nitro?.routeRules?.['/sitemap.xml'] as { prerender?: boolean } | undefined
    const sitemapPrerendered = !!(
      sitemapConfig?.zeroRuntime
      || sitemapRouteRule?.prerender
      || process.argv.includes('generate')
      || process.env.NUXT_GENERATE === 'true'
    )

    // Auto-derive runtimeSyncSecret: explicit config > env > random
    let runtimeSyncSecret = config.runtimeSyncSecret || process.env.NUXT_AI_READY_RUNTIME_SYNC_SECRET
    if (!runtimeSyncSecret && runtimeSyncEnabled) {
      runtimeSyncSecret = randomBytes(32).toString('hex')
      if (!nuxt.options.dev && !nuxt.options._prepare)
        logger.info(`Generated runtimeSyncSecret (use NUXT_AI_READY_RUNTIME_SYNC_SECRET env to set explicitly)`)
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
      const markdownLinkAvailabilityPath = join(dirname(buildDbPath), MARKDOWN_LINK_AVAILABILITY_FILE)

      // Helper to read from SQLite database during prerender
      // Uses node:sqlite or better-sqlite3 directly since we're in Node.js context
      // In dev mode, provide a stub to avoid rollup warnings about node:sqlite
      nitroConfig.virtual['#ai-ready-virtual/read-page-data.mjs'] = nuxt.options.dev
        ? `
export async function readPageDataFromFilesystem() { return { pages: [], errorRoutes: [] } }
export async function readMarkdownLinkAvailabilityFromFilesystem() { return { runtimeMarkdownAvailable: false, paths: [] } }
`
        : `
export async function readMarkdownLinkAvailabilityFromFilesystem() {
  if (!import.meta.prerender) {
    return { runtimeMarkdownAvailable: false, paths: [] }
  }

  const { readFile } = await import('node:fs/promises')
  try {
    const availability = JSON.parse(await readFile(${JSON.stringify(markdownLinkAvailabilityPath)}, 'utf8'))
    return {
      runtimeMarkdownAvailable: availability?.runtimeMarkdownAvailable === true,
      paths: Array.isArray(availability?.paths) ? availability.paths.filter(path => typeof path === 'string') : [],
    }
  }
  catch (error) {
    console.warn('[nuxt-ai-ready] Failed to read Markdown link availability; keeping canonical links.', error)
    return { runtimeMarkdownAvailable: false, paths: [] }
  }
}

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
    rows = db.prepare('SELECT route, title, description, markdown, headings, keywords, updated_at, is_error, locale FROM ai_ready_pages').all()
    db.close()
  }
  else {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(dbPath, { readonly: true })
    rows = db.prepare('SELECT route, title, description, markdown, headings, keywords, updated_at, is_error, locale FROM ai_ready_pages').all()
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
    locale: r.locale || '',
  }))
  const errorRoutes = rows.filter(r => r.is_error).map(r => r.route)

  return { pages, errorRoutes }
}
`
      // Runtime module exports empty arrays (pages read from database at runtime)
      nitroConfig.virtual['#ai-ready-virtual/page-data.mjs'] = `export const pages = []\nexport const errorRoutes = []`

      // Logger with debug level configured from module options
      nitroConfig.virtual['#ai-ready-virtual/logger.mjs'] = `
import { createModuleLogger } from 'nuxtseo-shared/utils'
export const logger = createModuleLogger('nuxt-ai-ready', ${!!config.debug})
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
        mcp: { enabled: mcpAvailable, tools: mcpAvailable && (config.mcp?.tools !== false), resources: mcpAvailable && (config.mcp?.resources !== false) },
        cron: !!config.cron,
      })}`

      // Content lookup: when @nuxt/content v3 is installed, this virtual
      // module bridges to its server APIs (queryCollection + minimark
      // stringify). Otherwise it exports a no-op stub so middleware code can
      // import unconditionally without bundling errors.
      nitroConfig.virtual['#ai-ready-virtual/content-lookup.mjs'] = hasNuxtContentV3
        ? `
import { queryCollection } from '@nuxt/content/server'
import manifest from '#content/manifest'
import { stringify } from 'minimark/stringify'

const pageCollections = Object.entries(manifest)
  .filter(([, info]) => info.type === 'page')
  .map(([name]) => name)

export async function lookupContentPage(event, path) {
  if (!pageCollections.length) return null
  const candidates = path === '/' ? ['/'] : [path, path.replace(/\\/$/, '')]
  for (const collection of pageCollections) {
    for (const candidate of candidates) {
      const page = await queryCollection(event, collection).path(candidate).first().catch(() => null)
      if (!page) continue
      const markdown = stringify({ ...page.body, type: 'minimark' }, { format: 'markdown/html' })
      return {
        markdown,
        title: page.title,
        description: page.description,
        updatedAt: page.seo?.articleModifiedTime || page.updatedAt,
      }
    }
  }
  return null
}
`
        : `export async function lookupContentPage() { return null }`
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
      i18n: i18nConfig,
      ftsTokenizer,
    } as any

    // Captures rendered HTML during prerendering so markdown.prerender can
    // reuse it instead of re-rendering each page
    addServerPlugin(resolve('./runtime/server/plugins/html-capture.prerender'))
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

    // Inject <link rel="alternate" type="text/markdown"> into HTML pages
    addPlugin({
      mode: 'server',
      src: resolve('./runtime/app/plugins/md-alternate.server'),
    })
    // gets replaced with a static file
    addServerHandler({ route: '/llms.txt', handler: resolve('./runtime/server/routes/llms.txt.get') })
    addServerHandler({ route: '/llms-full.txt', handler: resolve('./runtime/server/routes/llms-full.txt.get') })

    if (webmcpConfig) {
      addImports(['useWebMcpSupported', 'useWebMcpTool'].map(name => ({
        name,
        from: resolve('./runtime/app/composables/webmcp'),
      })))

      nuxt.options.runtimeConfig.public['nuxt-ai-ready'] = {
        webmcp: webmcpConfig,
      } satisfies ModuleAppRuntimeConfig as any

      addPlugin({ mode: 'client', src: resolve('./runtime/app/plugins/webmcp.client') })
      if (webmcpConfig.siteTools.length) {
        addServerHandler({ route: '/__ai-ready/pages', handler: resolve('./runtime/server/routes/__ai-ready/pages.get') })
      }
    }

    // Devtools API endpoint
    addServerHandler({ route: '/__ai-ready__/debug.json', handler: resolve('./runtime/server/routes/__ai-ready/devtools.get') })

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
        url: siteConfig.url ? withSiteUrl('/', { withBase: true }) : undefined,
        description: siteConfig.description,
      }, mergedLlmsTxt, indexNow, { ftsTokenizer, i18n: i18nConfig })
    }

    // Add lifecycle plugin to handle database connection cleanup
    addServerPlugin(resolve('./runtime/server/plugins/db-lifecycle'))

    // DevTools integration
    setupDevToolsUI({
      route: '/__nuxt-ai-ready',
      name: 'nuxt-ai-ready',
      title: 'AI Ready',
      icon: 'carbon:ai-label',
    }, resolve, nuxt)

    // Add route rules for static files with proper charset
    for (const route of ['/llms.txt', '/llms-full.txt']) {
      extendRouteRules(route, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }

    // Merge the charset header into _headers because Nitro route rules do not support suffix globs
    // The splat (*) greedily matches all characters including slashes, so /*.md matches all depths
    nuxt.hooks.hook('nitro:build:before', (nitro) => {
      nitro.hooks.hook('compiled', async () => {
        const headersPath = join(nitro.options.output.publicDir, '_headers')
        logger.debug(`Checking for _headers file: ${headersPath}`)
        const exists = await access(headersPath).then(() => true).catch(() => false)
        if (exists) {
          const headers = await readFile(headersPath, 'utf8')
          const mergedHeaders = ensureStaticHeader(
            headers,
            '/*.md',
            'Content-Type',
            'text/markdown; charset=utf-8',
          )
          if (mergedHeaders !== headers) {
            await writeFile(headersPath, mergedHeaders)
            logger.debug('Merged .md charset header into _headers')
          }
        }
      })
    })
  },
})

export type { ModuleOptions } from './runtime/types'
