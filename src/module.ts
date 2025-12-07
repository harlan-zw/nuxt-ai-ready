import type { Nuxt, NuxtPage } from '@nuxt/schema'
import type { BulkChunk, LlmsTxtConfig, ModuleOptions } from './runtime/types'
import { join } from 'node:path'
import { addPlugin, addServerHandler, addTypeTemplate, createResolver, defineNuxtModule, extendPages, hasNuxtModule, useNuxt } from '@nuxt/kit'
import defu from 'defu'
import { installNuxtSiteConfig, useSiteConfig, withSiteUrl } from 'nuxt-site-config/kit'
import { relative } from 'pathe'
import { readPackageJSON } from 'pkg-types'
import { logger } from './logger'
import { setupPrerenderHandler } from './prerender'

function createPagesPromise(nuxt: Nuxt = useNuxt()) {
  return new Promise<NuxtPage[]>((resolve) => {
    nuxt.hooks.hook('modules:done', () => {
      if ((typeof nuxt.options.pages === 'boolean' && !nuxt.options.pages) || (typeof nuxt.options.pages === 'object' && !nuxt.options.pages.enabled)) {
        return resolve([])
      }
      extendPages(resolve)
    })
  })
}

function flattenPages(pages: NuxtPage[], parent = ''): Array<{ path: string, name?: string, meta?: Record<string, unknown> }> {
  return pages.flatMap((page) => {
    const path = parent + page.path
    const current = { path, name: page.name, meta: page.meta }
    return page.children?.length ? [current, ...flattenPages(page.children, path)] : [current]
  })
}

export interface ModuleHooks {
  /**
   * Hook to add routes to the AI ready
   * Other modules can register their own API routes
   */
  'ai-ready:routes': (payload: { routes: Record<string, string> }) => void | Promise<void>
  /**
   * Hook called for each chunk generated during prerendering for bulk export
   */
  'ai-ready:chunk': (context: {
    chunk: BulkChunk
    route: string
    title: string
    description: string
    headings: Array<Record<string, string>>
  }) => void | Promise<void>
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
      timestamps: {
        enabled: false,
        manifestPath: 'node_modules/.cache/nuxt-seo/ai-index/content-hashes.json',
      },
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

    // Set up alias
    nuxt.options.nitro.alias = nuxt.options.nitro.alias || {}
    nuxt.options.alias['#ai-ready'] = resolve('./runtime')

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

    // Create virtual module for routes (used by dev MCP)
    const pagesPromise = createPagesPromise(nuxt)
    nuxt.hooks.hook('nitro:config', (nitroConfig) => {
      nitroConfig.virtual = nitroConfig.virtual || {}
      nitroConfig.virtual['#ai-ready/routes.mjs'] = async () => {
        const pages = await pagesPromise
        const routes = flattenPages(pages)
        return `export default ${JSON.stringify(routes)}`
      }
    })

    if (typeof config.contentSignal === 'object') {
      nuxt.options.robots.groups.push({
        userAgent: '*',
        contentUsage: [`train-ai=${config.contentSignal.aiTrain ? 'y' : 'n'}`],
        contentSignal: [`ai-train=${config.contentSignal.aiTrain ? 'yes' : 'no'}`, `search=${config.contentSignal.search ? 'yes' : 'no'}`, `ai-input=${config.contentSignal.aiInput ? 'yes' : 'no'}`],
      })
    }

    addTypeTemplate({
      filename: 'module/nuxt-ai-ready.d.ts',
      getContents: (data) => {
        const typesPath = relative(resolve(data.nuxt!.options.rootDir, data.nuxt!.options.buildDir, 'module'), resolve('runtime/types'))
        const nitroTypes = `  interface NitroRuntimeHooks {
    'ai-ready:markdown': (context: import('${typesPath}').MarkdownContext) => void | Promise<void>
    'ai-ready:mdreamConfig': (config: import('mdream').HTMLToMarkdownOptions) => void | Promise<void>
  }`
        return `// Generated by nuxt-ai-ready
declare module 'nitropack/types' {
${nitroTypes}
}

declare module 'nitropack' {
${nitroTypes}
}

export {}
`
      },
    }, {
      nitro: true,
    })

    // Build default llms.txt config with API endpoints
    const defaultLlmsTxtSections: LlmsTxtConfig['sections'] = []
    const pagesRoute = withSiteUrl('llms.toon')
    const pagesChunksRoute = withSiteUrl('llms-full.toon')
    defaultLlmsTxtSections.push({
      title: 'LLM Resources',
      links: [
        {
          title: 'Pages Minimal',
          href: pagesRoute,
          description: `Page-level metadata in TOON format (token-efficient JSON encoding, see https://toonformat.dev). Contains: route, title, description, headings, chunkIds. Use with llms-full.toon for complete content. Fields: { route, title, description, headings, chunkIds }.\n\n  <code lang="bash">curl "${pagesRoute}"</code>`,
        },
        {
          title: 'Page Chunks',
          href: pagesChunksRoute,
          description: `Individual content chunks in TOON format for RAG/embeddings. Contains: id, route, content. Fields: { id, route, content }. Join with llms.toon using route to get title/description/headings metadata. Chunk index inferred from id suffix (e.g., "hash-0", "hash-1").\n\n  <code lang="bash">curl "${pagesChunksRoute}"</code>`,
        },
      ],
    })

    const hasMCP = hasNuxtModule('@nuxtjs/mcp-toolkit')
    if (hasMCP) {
      // Register MCP definitions from runtime directory (dev uses sitemap, prod uses .toon files)
      nuxt.hook('mcp:definitions:paths', (paths) => {
        const mcpRuntimeDir = resolve(`./runtime/server/mcp/${nuxt.options.dev ? 'dev' : 'prod'}`)
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

    const timestampsManifestPath = config.timestamps?.enabled
      ? join(nuxt.options.rootDir, config.timestamps.manifestPath || 'node_modules/.cache/nuxt-seo/ai-index/content-hashes.json')
      : undefined

    nuxt.options.runtimeConfig['nuxt-ai-ready'] = {
      version: version || '0.0.0',
      debug: config.debug || false,
      hasSitemap: hasNuxtModule('@nuxtjs/sitemap'),
      mdreamOptions: config.mdreamOptions || {},
      markdownCacheHeaders: defu(config.markdownCacheHeaders, {
        maxAge: 3600,
        swr: true,
      }) as Required<NonNullable<ModuleOptions['markdownCacheHeaders']>>,
      llmsTxt: mergedLlmsTxt,
      timestampsManifestPath,
    } as any

    // Register sitemap integration when timestamps enabled
    if (config.timestamps?.enabled && hasNuxtModule('@nuxtjs/sitemap')) {
      nuxt.hook('nitro:config', (nitroConfig) => {
        nitroConfig.plugins = nitroConfig.plugins || []
        nitroConfig.plugins.push(resolve('./runtime/server/plugins/sitemap-lastmod'))
      })
    }

    addServerHandler({
      middleware: true,
      handler: resolve('./runtime/server/middleware/mdream'),
    })

    if (nuxt.options.build) {
      addPlugin({ mode: 'server', src: resolve('./runtime/nuxt/plugins/prerender') })
    }
    // gets replaced with a static file
    addServerHandler({ route: '/llms.txt', handler: resolve('./runtime/server/routes/llms.txt.get') })
    addServerHandler({ route: '/llms-full.txt', handler: resolve('./runtime/server/routes/llms.txt.get') })

    // Setup prerendering hooks for static generation
    // @ts-expect-error untyped
    const isStatic = nuxt.options.nitro.static || nuxt.options._generate || false
    if (isStatic || nuxt.options.nitro.prerender?.routes?.length) {
      setupPrerenderHandler(mergedLlmsTxt, config.timestamps)
    }

    // Add route rules for static TOON files
    nuxt.options.nitro.routeRules = nuxt.options.nitro.routeRules || {}
    nuxt.options.nitro.routeRules['/llms.toon'] = { headers: { 'Content-Type': 'text/toon; charset=utf-8' } }
    nuxt.options.nitro.routeRules['/llms-full.toon'] = { headers: { 'Content-Type': 'text/toon; charset=utf-8' } }
  },
})

export type { BulkChunk, ModuleOptions }

declare module '@nuxt/schema' {
  interface NuxtHooks extends ModuleHooks {}
}
