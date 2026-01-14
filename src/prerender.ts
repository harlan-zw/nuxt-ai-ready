import type { Nuxt } from '@nuxt/schema'
import type { Nitro, PrerenderRoute } from 'nitropack/types'
import type { DatabaseAdapter } from './runtime/server/db/shared'
import type { SiteInfo } from './runtime/server/utils/llms-full'
import type { LlmsTxtConfig } from './runtime/types'
import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { useNuxt } from '@nuxt/kit'
import { parseSitemapXml } from '@nuxtjs/sitemap/utils'
import { colorize } from 'consola/utils'
import { withBase } from 'ufo'
import { logger } from './logger'
import { computeContentHash, createAdapter, exportDbDump, initSchema, insertPage, queryAllPages } from './runtime/server/db/shared'
import { buildLlmsFullTxtHeader, formatPageForLlmsFullTxt } from './runtime/server/utils/llms-full'

export interface ParsedMarkdownResult {
  markdown: string
  title: string
  description: string
  headings: Array<Record<string, string>>
  keywords?: string[]
  updatedAt?: string
}

interface SitemapEntry {
  loc: string
  lastmod?: string | Date
}

export interface CrawlerState {
  prerenderedRoutes: Set<string>
  errorRoutes: Set<string>
  totalProcessingTime: number
  initialized: boolean
  dbPath?: string
  db?: DatabaseAdapter
  llmsFullTxtPath?: string
  siteInfo?: SiteInfo
  llmsTxtConfig?: LlmsTxtConfig
}

function createCrawlerState(
  dbPath?: string,
  llmsFullTxtPath?: string,
  siteInfo?: SiteInfo,
  llmsTxtConfig?: LlmsTxtConfig,
): CrawlerState {
  return {
    prerenderedRoutes: new Set(),
    errorRoutes: new Set(),
    totalProcessingTime: 0,
    initialized: false,
    dbPath,
    llmsFullTxtPath,
    siteInfo,
    llmsTxtConfig,
  }
}

async function initCrawler(state: CrawlerState): Promise<void> {
  if (state.initialized)
    return

  // Initialize SQLite database for page data
  if (state.dbPath) {
    await mkdir(dirname(state.dbPath), { recursive: true })
    const nodeVersion = Number.parseInt(process.versions.node?.split('.')[0] || '0')
    const connectorPath = nodeVersion >= 22 ? 'db0/connectors/node-sqlite' : 'db0/connectors/better-sqlite3'
    const { default: connectorFn } = await import(connectorPath)
    const connector = connectorFn({ path: state.dbPath })
    state.db = createAdapter(connector)
    await initSchema(state.db)
    logger.debug(`Crawler initialized with SQLite at ${state.dbPath} using ${connectorPath}`)
  }

  // Initialize llms-full.txt with header
  if (state.llmsFullTxtPath) {
    await mkdir(dirname(state.llmsFullTxtPath), { recursive: true })
    const header = buildLlmsFullTxtHeader(state.siteInfo, state.llmsTxtConfig)
    await writeFile(state.llmsFullTxtPath, header, 'utf-8')
    logger.debug(`llms-full.txt initialized at ${state.llmsFullTxtPath}`)
  }

  state.initialized = true
}

function flattenHeadings(headings: Array<Record<string, string>> | undefined): string {
  return (headings || [])
    .map(h => Object.entries(h).map(([tag, text]) => `${tag}:${text}`).join(''))
    .join('|')
}

async function processMarkdownRoute(
  state: CrawlerState,
  nuxt: Nuxt,
  route: string,
  parsed: ParsedMarkdownResult,
  lastmod?: string | Date,
  options?: { skipLlmsFullTxt?: boolean },
): Promise<void> {
  const { markdown, title, description, headings, keywords, updatedAt: metaUpdatedAt } = parsed

  let updatedAt = (lastmod instanceof Date ? lastmod.toISOString() : lastmod) || new Date().toISOString()
  if (metaUpdatedAt) {
    const parsedDate = new Date(metaUpdatedAt)
    if (!Number.isNaN(parsedDate.getTime()))
      updatedAt = parsedDate.toISOString()
  }

  await nuxt.hooks.callHook('ai-ready:page:markdown', { route, markdown, title, description, headings })

  // Insert into SQLite database
  if (state.db) {
    const contentHash = await computeContentHash(markdown)
    await insertPage(state.db, {
      route,
      title,
      description,
      markdown,
      headings: flattenHeadings(headings),
      keywords: keywords || [],
      contentHash,
      updatedAt,
    })
  }

  // Stream-append to llms-full.txt (skip for sitemap-only crawled pages)
  if (state.llmsFullTxtPath && !options?.skipLlmsFullTxt) {
    const pageContent = formatPageForLlmsFullTxt(route, title, description, markdown, state.siteInfo?.url)
    await appendFile(state.llmsFullTxtPath, pageContent, 'utf-8')
  }

  state.prerenderedRoutes.add(route)
}

async function crawlSitemapEntries(
  state: CrawlerState,
  nuxt: Nuxt,
  nitro: Nitro,
  entries: Array<string | SitemapEntry>,
): Promise<number> {
  logger.debug(`Crawling ${entries.length} sitemap entries`)
  let crawled = 0
  let skipped = 0

  for (const entry of entries) {
    const loc = typeof entry === 'string' ? entry : entry.loc
    const lastmod = typeof entry === 'string' ? undefined : entry.lastmod
    // Handle both absolute URLs and relative paths
    const route = loc.startsWith('http') ? new URL(loc).pathname : loc

    // Skip internal/special files (e.g., _headers, _redirects)
    if (route.split('/').some(segment => segment.startsWith('_'))) {
      skipped++
      continue
    }

    if (state.prerenderedRoutes.has(route)) {
      skipped++
      continue
    }

    const mdRoute = route === '/' ? '/index.md' : `${route}.md`
    const mdUrl = withBase(mdRoute, nitro.options.baseURL)
    logger.debug(`Fetching markdown for ${route} → ${mdUrl}`)

    // Error pages are filtered by prerender middleware (returns 404 for __NUXT_ERROR__ pages)
    const res = await globalThis.$fetch(mdUrl, {
      headers: { 'x-nitro-prerender': mdRoute },
    }).catch((err) => {
      logger.debug(`Skipping ${route}: ${err.message}`)
      return null
    }) as string | null

    if (!res)
      continue

    // Check if response is JSON before parsing
    let parsed: ParsedMarkdownResult
    try {
      parsed = JSON.parse(res) as ParsedMarkdownResult
    }
    catch (err) {
      // Response is not JSON - likely HTML was returned instead of markdown
      logger.debug(`Skipping ${route}: Response is not JSON (likely HTML instead of markdown conversion)`, err)
      continue
    }

    // Skip llms-full.txt for sitemap-crawled pages - only include prerendered pages
    await processMarkdownRoute(state, nuxt, route, parsed, lastmod, { skipLlmsFullTxt: true })
    crawled++
  }

  logger.debug(`Sitemap crawl complete: ${crawled} crawled, ${skipped} skipped`)
  return crawled
}

async function crawlSitemapContent(
  state: CrawlerState,
  nuxt: Nuxt,
  nitro: Nitro,
  sitemapContent: string,
): Promise<number> {
  logger.debug(`Parsing sitemap XML (${sitemapContent.length} bytes)`)
  const result = await parseSitemapXml(sitemapContent)
  const urls = result?.urls || []
  logger.debug(`Found ${urls.length} URLs in sitemap`)
  return crawlSitemapEntries(state, nuxt, nitro, urls)
}

function isNuxtGenerate(): boolean {
  return process.argv.includes('generate') || process.env.NUXT_GENERATE === 'true' || process.env.prerender === 'true'
}

function resolveNitroPreset(): string | undefined {
  return process.env.NITRO_PRESET || process.env.SERVER_PRESET
}

function includesSitemapRoot(sitemapName: string, routes: string[]): boolean {
  return routes.some(r => r === `/${sitemapName}` || r.startsWith(`/${sitemapName}/`))
}

export function detectSitemapPrerender(sitemapName = 'sitemap.xml'): { useSitemapHook: boolean, usePrerenderHook: boolean } {
  const nuxt = useNuxt()
  const prerenderedRoutes = (nuxt.options.nitro.prerender?.routes || []) as string[]

  // Check if @nuxtjs/sitemap module is installed - it auto-prerenders sitemap.xml
  const hasSitemapModule = nuxt.options._installedModules?.some(
    m => m.meta?.name === '@nuxtjs/sitemap',
  )

  let prerenderSitemap = hasSitemapModule || isNuxtGenerate() || includesSitemapRoot(sitemapName, prerenderedRoutes)

  if (resolveNitroPreset() === 'vercel-edge')
    prerenderSitemap = true

  const hasPrerender = !!(nuxt.options.nitro.prerender?.routes?.length || nuxt.options.nitro.prerender?.crawlLinks)
  const shouldHookIntoPrerender = prerenderSitemap || hasPrerender

  logger.debug(`Sitemap detection: module=${hasSitemapModule}, generate=${isNuxtGenerate()}, routes=${includesSitemapRoot(sitemapName, prerenderedRoutes)}`)

  // If sitemap prerendering, use sitemap hook as it fires after sitemap is done
  // Otherwise use prerender:done if any prerendering is happening
  return {
    useSitemapHook: prerenderSitemap,
    usePrerenderHook: shouldHookIntoPrerender && !prerenderSitemap,
  }
}

async function prerenderRoute(nitro: Nitro, route: string) {
  const start = Date.now()
  const encodedRoute = encodeURI(route)
  const fetchUrl = withBase(encodedRoute, nitro.options.baseURL)

  const res = await globalThis.$fetch.raw(fetchUrl, {
    headers: { 'x-nitro-prerender': encodedRoute },
    retry: nitro.options.prerender.retry,
    retryDelay: nitro.options.prerender.retryDelay,
  })

  const filePath = join(nitro.options.output.publicDir, route)
  await mkdir(dirname(filePath), { recursive: true })

  const data = res._data
  if (data === undefined)
    throw new Error(`No data returned from '${fetchUrl}'`)

  await writeFile(filePath, data as string, 'utf8')

  const _route: PrerenderRoute = {
    route,
    fileName: filePath,
    generateTimeMS: Date.now() - start,
  }
  nitro._prerenderedRoutes!.push(_route)

  return stat(filePath)
}

export function setupPrerenderHandler(
  dbPath?: string,
  siteInfo?: SiteInfo,
  llmsTxtConfig?: LlmsTxtConfig,
) {
  const nuxt = useNuxt()

  nuxt.hooks.hook('nitro:init', async (nitro: Nitro) => {
    // llms-full.txt is streamed directly to public dir
    const llmsFullTxtPath = join(nitro.options.output.publicDir, 'llms-full.txt')
    const state = createCrawlerState(dbPath, llmsFullTxtPath, siteInfo, llmsTxtConfig)
    let initPromise: Promise<void> | null = null

    nitro.hooks.hook('prerender:generate', async (route) => {
      // Track error routes for filtering in llms.txt
      if (route.error) {
        const pageRoute = route.route.replace(/\.(html|md)$/, '').replace(/\/index$/, '') || '/'
        state.errorRoutes.add(pageRoute)
        logger.debug(`Detected error page: ${pageRoute}`)
        return
      }

      if (!route.fileName?.endsWith('.md'))
        return

      let pageRoute = route.route.replace(/\.md$/, '')
      if (pageRoute === '/index')
        pageRoute = '/'

      const pageStartTime = Date.now()

      // Initialize on first page
      if (!initPromise)
        initPromise = initCrawler(state)
      await initPromise

      const parsed = JSON.parse(route.contents || '{}') as ParsedMarkdownResult
      await processMarkdownRoute(state, nuxt, pageRoute, parsed)

      route.contents = parsed.markdown
      state.totalProcessingTime += Date.now() - pageStartTime
    })

    async function writeLlmsFiles() {
      // Insert error routes into database
      if (state.db && state.errorRoutes.size > 0) {
        for (const route of state.errorRoutes) {
          await insertPage(state.db, {
            route,
            title: '',
            description: '',
            markdown: '',
            headings: '',
            keywords: [],
            updatedAt: new Date().toISOString(),
            isError: true,
          })
        }
        logger.debug(`Wrote ${state.errorRoutes.size} error routes to database`)
      }

      // Write page data JSON for runtime access
      const publicDataDir = join(nitro.options.output.publicDir, '__ai-ready')
      await mkdir(publicDataDir, { recursive: true })

      if (state.db) {
        // Single query for all pages (with errors) - excludeMarkdown reduces memory ~80%
        const allPages = await queryAllPages(state.db, { includeErrors: true, excludeMarkdown: true })
        const pages = allPages.filter(p => !p.isError)
        const errorRoutesList = allPages.filter(p => p.isError).map(p => p.route)

        // Write JSON for backwards compatibility
        const jsonContent = JSON.stringify({
          pages: pages.map(p => ({
            route: p.route,
            title: p.title,
            description: p.description,
            headings: p.headings,
            keywords: p.keywords || [],
            updatedAt: p.updatedAt,
          })),
          errorRoutes: errorRoutesList,
        })
        const publicJsonPath = join(publicDataDir, 'pages.json')
        await writeFile(publicJsonPath, jsonContent, 'utf-8')
        logger.debug(`Wrote ${pages.length} pages to __ai-ready/pages.json`)

        // Export database dump for serverless restore (streams in batches internally)
        const dumpData = await exportDbDump(state.db)
        const dumpPath = join(publicDataDir, 'pages.dump')
        await writeFile(dumpPath, dumpData, 'utf-8')
        logger.debug(`Created database dump at __ai-ready/pages.dump (${(dumpData.length / 1024).toFixed(1)}kb compressed)`)
      }

      // Only prerender llms.txt - llms-full.txt is already streamed
      const llmsStats = await prerenderRoute(nitro, '/llms.txt')
      const llmsFullStats = await stat(state.llmsFullTxtPath!)

      const kb = (b: number) => (b / 1024).toFixed(1)
      const totalKb = kb(llmsStats.size + llmsFullStats.size)
      const dim = (s: string) => colorize('dim', s)
      const cyan = (s: string) => colorize('cyan', s)
      const timeStr = state.totalProcessingTime >= 100 ? ` in ${cyan(`${(state.totalProcessingTime / 1000).toFixed(1)}s`)}` : ''
      logger.info(`Indexed ${cyan(String(state.prerenderedRoutes.size))} pages for llms.txt${timeStr} → ${cyan(`${totalKb}kb`)}`)
      logger.info(dim(`  llms.txt: ${kb(llmsStats.size)}kb, llms-full.txt: ${kb(llmsFullStats.size)}kb`))
    }

    const { useSitemapHook, usePrerenderHook } = detectSitemapPrerender()
    logger.debug(`Prerender hooks: sitemap=${useSitemapHook}, prerender=${usePrerenderHook}`)

    if (useSitemapHook) {
      // sitemap:prerender:done fires after sitemap.xml is written
      nuxt.hooks.hook('sitemap:prerender:done', async (ctx) => {
        if (!state.initialized)
          return

        for (const sitemap of ctx.sitemaps)
          await crawlSitemapContent(state, nuxt, nitro, sitemap.content)

        await writeLlmsFiles()
        state.prerenderedRoutes.clear()
      })
    }
    else if (usePrerenderHook) {
      nitro.hooks.hook('prerender:done', async () => {
        if (!state.initialized)
          return

        const sitemapContent = await globalThis.$fetch('/sitemap.xml', {
          headers: { 'x-nitro-prerender': '/sitemap.xml' },
        }).catch(() => null) as string | null

        if (sitemapContent)
          await crawlSitemapContent(state, nuxt, nitro, sitemapContent)

        await writeLlmsFiles()
        state.prerenderedRoutes.clear()
      })
    }
  })
}
