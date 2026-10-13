import type { Nuxt } from '@nuxt/schema'
import type { Nitro, PrerenderRoute } from 'nitropack/types'
import type { RuntimeI18nConfig } from 'nuxtseo-shared/i18n-runtime'
import type { DatabaseAdapter } from './runtime/server/db/shared'
import type { SiteInfo } from './runtime/server/utils/llms-full'
import type { LlmsTxtConfig, ModuleOptions } from './runtime/types'
import type { ResolvedDatabase } from './utils/database'
import { appendFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { getNitroVersion, hasNuxtModule, resolveFiles, useNuxt } from '@nuxt/kit'
import { colorize } from 'consola/utils'
import { resolveLocaleFromRoute } from 'nuxtseo-shared/i18n-runtime'
import { createPrerenderFetch } from 'nuxtseo-shared/prerender'
import { collectSitemap } from 'sitemapd/parse'
import { joinURL, withBase, withLeadingSlash } from 'ufo'
import { logger } from './logger'
import { MARKDOWN_LINK_AVAILABILITY_FILE } from './prerender-constants'
import { parsePrerenderRoute, resolvePrerenderFile } from './prerender-path'
import { insertLlmsTxtDirective } from './runtime/llms-txt-directive'
import { absoluteSiteUrl } from './runtime/markdown-links'
import { hasMarkdownTwin, normalizePagePath, toMarkdownPath } from './runtime/markdown-path'
import { toDeployedRoute, toLogicalRoute } from './runtime/route-path'
import { computeContentHash, exportDbDump, initSchema, insertPage, queryAllPages } from './runtime/server/db/shared'
import { buildLlmsFullTxtHeader, formatPageForLlmsFullTxt } from './runtime/server/utils/llms-full'
import { resolvePageUpdatedAt } from './runtime/server/utils/page-updated-at'
import { appendSitemapSection, SITEMAP_MD_ROUTE } from './runtime/server/utils/sitemap-md'

const PRERENDER_PAGE_TIMEOUT = 30000 // 30s per-page timeout for prerender self-fetches
type PrerenderFetch = ReturnType<typeof createPrerenderFetch>['fetch']

const RE_HTML_MD_EXT = /\.(html|md)$/
const RE_INDEX_SUFFIX = /\/index$/
const RE_MD_EXT = /\.md$/
const RE_NEGATED_GLOB = /^(!?)(.*)$/
const RE_PARENT_DIR_GLOB = /!?\.\.\//

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

interface PublicAssetSource {
  dir: string
  baseURL?: string
}

async function findOutputMarkdownPaths(
  publicDir: string,
  baseURL: string,
  srcDir: string,
  ignoredPaths: string[],
  publicAssets: PublicAssetSource[],
): Promise<string[]> {
  const paths = new Set<string>()

  async function visit(directory: string, urlBase: string, relativeDirectory = ''): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const relativePath = join(relativeDirectory, entry.name)
      if (entry.isDirectory()) {
        await visit(join(directory, entry.name), urlBase, relativePath)
      }
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const urlPath = joinURL(urlBase, relativePath.replaceAll('\\', '/'))
        paths.add(joinURL(baseURL, urlPath))
      }
    }))
  }

  await visit(publicDir, '/')

  for (const asset of publicAssets) {
    const patterns = [
      '**/*.md',
      ...ignoredPaths.map((ignoredPath) => {
        const [, negated = '', pattern = ''] = ignoredPath.match(RE_NEGATED_GLOB) || []
        const assetPattern = pattern.startsWith('*')
          ? pattern
          : relative(asset.dir, resolve(srcDir, pattern)).replaceAll('\\', '/')
        return `${negated ? '' : '!'}${assetPattern}`
      }).filter(pattern => !RE_PARENT_DIR_GLOB.test(pattern)),
    ]
    const files = await resolveFiles(asset.dir, patterns)
    for (const file of files) {
      const urlPath = joinURL(asset.baseURL || '/', relative(asset.dir, file).replaceAll('\\', '/'))
      paths.add(joinURL(baseURL, urlPath))
    }
  }

  return [...paths].sort()
}

export type PrerenderI18nConfig = RuntimeI18nConfig

export interface CrawlerState {
  fetch?: PrerenderFetch
  prerenderedRoutes: Set<string>
  errorRoutes: Set<string>
  totalProcessingTime: number
  initialized: boolean
  dbPath?: string
  db?: DatabaseAdapter
  llmsFullTxtPath?: string
  siteInfo?: SiteInfo
  llmsTxtConfig?: LlmsTxtConfig
  concurrency: number
  ftsTokenizer?: string
  i18n?: PrerenderI18nConfig | null
}

function crawlerFetch(state: CrawlerState): PrerenderFetch {
  if (!state.fetch)
    throw new Error('The Nitro prerender app is not initialized.')
  return state.fetch
}

function createCrawlerState(
  dbPath?: string,
  llmsFullTxtPath?: string,
  siteInfo?: SiteInfo,
  llmsTxtConfig?: LlmsTxtConfig,
  concurrency = 10,
  ftsTokenizer?: string,
  i18n?: PrerenderI18nConfig | null,
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
    concurrency,
    ftsTokenizer,
    i18n,
  }
}

async function initCrawler(state: CrawlerState): Promise<void> {
  if (state.initialized)
    return

  // Initialize SQLite database for page data
  if (state.dbPath) {
    logger.debug(`Creating directory for SQLite: ${dirname(state.dbPath)}`)
    await mkdir(dirname(state.dbPath), { recursive: true })
    const db = await createPrerenderDatabase(state.dbPath)
    state.db = db
    await initSchema(db, { ftsTokenizer: state.ftsTokenizer })
    logger.debug(`Crawler initialized with SQLite at ${state.dbPath} (tokenizer: ${state.ftsTokenizer || 'default'})`)
  }

  // Initialize llms-full.txt with header
  if (state.llmsFullTxtPath) {
    logger.debug(`Creating directory for llms-full.txt: ${dirname(state.llmsFullTxtPath)}`)
    await mkdir(dirname(state.llmsFullTxtPath), { recursive: true })
    const header = buildLlmsFullTxtHeader(state.siteInfo, state.llmsTxtConfig)
    logger.debug(`Writing llms-full.txt header (${(header.length / 1024).toFixed(1)}kb)`)
    await writeFile(state.llmsFullTxtPath, header, 'utf-8')
    logger.debug(`llms-full.txt initialized at ${state.llmsFullTxtPath}`)
  }

  state.initialized = true
}

/**
 * PRAGMAs applied to the build-time SQLite database.
 *
 * Every `insertPage` runs as its own implicit transaction, so the default
 * `synchronous = FULL` costs one fsync per page. On a 371 page site that fsync
 * loop was the single most expensive frame of the whole prerender indexer.
 *
 * Durability buys nothing here. This database lives in `.nuxt/.data/ai-ready`,
 * it is written and read inside one build process, and a failed build discards
 * it. `synchronous = OFF` only drops the guarantee against OS crash or power
 * loss; the rollback journal still protects against a process crash, so we
 * keep the default journal mode.
 */
const PRERENDER_PRAGMAS = [
  'PRAGMA synchronous = OFF',
  'PRAGMA temp_store = MEMORY',
]

interface SqliteStatement {
  all: (...params: never[]) => unknown[]
  get: (...params: never[]) => unknown
  run: (...params: never[]) => unknown
}

interface SqliteDriver {
  prepare: (sql: string) => SqliteStatement
  exec: (sql: string) => unknown
  close: () => void
}

/**
 * Wrap a synchronous SQLite driver as a `DatabaseAdapter`.
 *
 * Statements are cached by SQL text. The indexer runs the same INSERT once per
 * page, so re-parsing it every call was pure waste. The cache is dropped on any
 * parameterless statement, which is how `initSchema` runs its DDL, so a cached
 * statement can never outlive the table it reads.
 */
function createSqliteAdapter(sqlite: SqliteDriver): DatabaseAdapter {
  const statements = new Map<string, SqliteStatement>()

  function prepare(sql: string): SqliteStatement {
    let statement = statements.get(sql)
    if (!statement) {
      statement = sqlite.prepare(sql)
      statements.set(sql, statement)
    }
    return statement
  }

  return {
    all: async <T>(sql: string, params: unknown[] = []) => prepare(sql).all(...params as never[]) as T[],
    first: async <T>(sql: string, params: unknown[] = []) => prepare(sql).get(...params as never[]) as T | undefined,
    exec: async (sql: string, params: unknown[] = []) => {
      if (params.length) {
        prepare(sql).run(...params as never[])
        return
      }
      statements.clear()
      sqlite.exec(sql)
    },
    close: async () => {
      statements.clear()
      sqlite.close()
    },
  }
}

export async function createPrerenderDatabase(dbPath: string): Promise<DatabaseAdapter> {
  const { DatabaseSync } = await import('node:sqlite')
  const sqlite = new DatabaseSync(dbPath)
  for (const pragma of PRERENDER_PRAGMAS)
    sqlite.exec(pragma)
  return createSqliteAdapter(sqlite as unknown as SqliteDriver)
}

function flattenHeadings(headings: Array<Record<string, string>> | undefined): string {
  return (headings || [])
    .map(h => Object.entries(h).map(([tag, text]) => `${tag}:${text}`).join(''))
    .join('|')
}

function resolveRouteLocale(route: string, i18n: PrerenderI18nConfig | null | undefined): string {
  return i18n ? resolveLocaleFromRoute(route, i18n).locale : ''
}

async function processMarkdownRoute(
  state: CrawlerState,
  nuxt: Nuxt,
  route: string,
  parsed: ParsedMarkdownResult,
  lastmod?: string | Date,
  options?: { skipLlmsFullTxt?: boolean },
): Promise<void> {
  route = normalizePagePath(route)
  const { title, description, headings, keywords, updatedAt: metaUpdatedAt } = parsed

  const updatedAt = resolvePageUpdatedAt(lastmod, metaUpdatedAt)

  const hookContext = { ...parsed, route }
  await nuxt.hooks.callHook('ai-ready:page:markdown' as any, hookContext)
  // Persist the hook's Markdown mutation for all downstream outputs.
  const { markdown } = hookContext
  parsed.markdown = markdown

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
      locale: resolveRouteLocale(route, state.i18n),
    })
  }

  // Stream-append to llms-full.txt (skip sitemap-only pages and hook-filtered content)
  if (state.llmsFullTxtPath && !options?.skipLlmsFullTxt && markdown.trim()) {
    const pageContent = formatPageForLlmsFullTxt(route, title, description, markdown, state.siteInfo?.url)
    logger.debug(`Appending to llms-full.txt: ${route} (${(pageContent.length / 1024).toFixed(1)}kb)`)
    await appendFile(state.llmsFullTxtPath, pageContent, 'utf-8')
  }

  state.prerenderedRoutes.add(route)
}

async function processSitemapEntry(
  state: CrawlerState,
  nuxt: Nuxt,
  nitro: Nitro,
  entry: string | SitemapEntry,
): Promise<{ crawled: boolean, skipped: boolean }> {
  const loc = typeof entry === 'string' ? entry : entry.loc
  const lastmod = typeof entry === 'string' ? undefined : entry.lastmod
  // Handle both absolute URLs and relative paths
  const parsedRoute = parsePrerenderRoute(loc, nitro.options.baseURL)
  if (parsedRoute._tag === 'Invalid') {
    logger.warn(`Skipping unsafe sitemap URL: ${loc}`)
    return { crawled: false, skipped: true }
  }
  const route = parsedRoute.route

  if (!hasMarkdownTwin(route))
    return { crawled: false, skipped: true }

  // Public HTML is served by the asset host, not the prerender SSR app.
  if (nitro.options.static) {
    for (const asset of nitro.options.publicAssets) {
      const assetBase = asset.baseURL || '/'
      if (!route.startsWith(assetBase))
        continue
      const assetRoute = route.slice(assetBase.length)
      for (const htmlRoute of [`${assetRoute}.html`, `${assetRoute}/index.html`]) {
        const htmlPath = resolvePrerenderFile(asset.dir, htmlRoute)
        const existing = await stat(htmlPath).catch((error) => {
          if (error.code === 'ENOENT')
            return undefined
          throw error
        })
        if (existing?.isFile())
          return { crawled: false, skipped: true }
      }
    }
  }

  // Skip internal/special files (e.g., _headers, _redirects)
  if (route.split('/').some(segment => segment.startsWith('_'))) {
    return { crawled: false, skipped: true }
  }

  if (state.prerenderedRoutes.has(route)) {
    return { crawled: false, skipped: true }
  }

  const mdRoute = toMarkdownPath(route)
  const mdUrl = toDeployedRoute(mdRoute, nitro.options.baseURL)
  // Sitemap discovery uses its own fetch loop, outside Nitro's prerender queue.
  // Respect exclusions for both the source page and its generated twin.
  const candidates = [route, toDeployedRoute(route, nitro.options.baseURL), mdRoute, mdUrl]
  const ignored = nitro.options.prerender.ignore.some(pattern => candidates.some((path) => {
    if (typeof pattern === 'string')
      return path.startsWith(pattern)
    if (typeof pattern === 'function')
      return pattern(path) === true
    return pattern.test(path)
  }))
  if (ignored)
    return { crawled: false, skipped: true }

  logger.debug(`Fetching markdown for ${route} → ${mdUrl}`)

  // Error pages are filtered by prerender middleware (returns 404 for __NUXT_ERROR__ pages)
  //
  // `retry: 0` because ofetch retries a 500 once by default, and a page that
  // fails to render at build time fails the same way on the second attempt. The
  // caller skips the route either way, so the retry only pays for a second full
  // SSR render of every broken page.
  const res = await crawlerFetch(state)(mdUrl, {
    headers: { 'x-nitro-prerender': mdRoute },
    retry: 0,
    signal: AbortSignal.timeout(PRERENDER_PAGE_TIMEOUT),
  }).catch((err) => {
    if (err?.response?.status === 404 || err?.response?.status === 410)
      state.errorRoutes.add(route)
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError')
      logger.warn(`Timeout (${PRERENDER_PAGE_TIMEOUT}ms) fetching markdown for ${route}`)
    else
      logger.debug(`Skipping ${route}: ${err.message}`)
    return null
  }) as string | null

  if (!res)
    return { crawled: false, skipped: false }

  // Check if response is JSON before parsing
  let parsed: ParsedMarkdownResult
  try {
    parsed = JSON.parse(res) as ParsedMarkdownResult
  }
  catch (err) {
    // Response is not JSON - likely HTML was returned instead of markdown
    logger.debug(`Skipping ${route}: Response is not JSON (likely HTML instead of markdown conversion)`, err)
    return { crawled: false, skipped: false }
  }

  // Skip llms-full.txt for sitemap-crawled pages - only include prerendered pages
  await processMarkdownRoute(state, nuxt, route, parsed, lastmod, { skipLlmsFullTxt: true })
  if (nitro.options.static) {
    // Public Markdown files belong to Nitro's copy and ignore policy.
    for (const asset of nitro.options.publicAssets) {
      const assetBase = asset.baseURL || '/'
      if (!mdRoute.startsWith(assetBase))
        continue
      const source = resolvePrerenderFile(asset.dir, mdRoute.slice(assetBase.length))
      const existing = await stat(source).catch((error) => {
        if (error.code === 'ENOENT')
          return undefined
        throw error
      })
      if (existing?.isFile())
        return { crawled: true, skipped: false }
    }
    const generated: PrerenderRoute = { route: mdRoute, fileName: mdRoute, contents: JSON.stringify(parsed) }
    await nitro.hooks.callHook('prerender:generate', generated, nitro)
    if (generated.skip || generated.error)
      return { crawled: true, skipped: false }
    const filePath = resolvePrerenderFile(nitro.options.output.publicDir, mdRoute)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, generated.contents || '', 'utf8')
    nitro._prerenderedRoutes!.push(generated)
  }
  return { crawled: true, skipped: false }
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
  const BATCH_SIZE = state.concurrency

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map(entry => processSitemapEntry(state, nuxt, nitro, entry)))

    for (const result of results) {
      if (result.crawled)
        crawled++
      if (result.skipped)
        skipped++
    }
  }

  logger.debug(`Sitemap crawl complete: ${crawled} crawled, ${skipped} skipped`)
  return crawled
}

export async function crawlSitemapContent(
  state: CrawlerState,
  nuxt: Nuxt,
  nitro: Nitro,
  sitemapContent: string,
  seen = new Set<string>(),
  depth = 0,
  documents = new Map<string, () => string>(),
  budget = { fetched: 0, warned: false },
): Promise<number> {
  logger.debug(`Parsing sitemap XML (${sitemapContent.length} bytes)`)
  const result = await collectSitemap(sitemapContent)
  if (result._tag !== 'document') {
    const issues = result.issues.map(issue => issue.message).join('; ')
    logger.debug(`Skipping sitemap: ${issues || 'document is not a URL set'}`)
    return 0
  }
  if (result.document._tag === 'index') {
    let crawled = 0
    const origin = new URL(state.siteInfo?.url || 'http://localhost').origin
    for (const entry of result.document.entries) {
      if (parsePrerenderRoute(entry.loc, nitro.options.baseURL)._tag === 'Invalid')
        continue
      const url = new URL(entry.loc, origin)
      if (url.origin !== origin || seen.has(url.href))
        continue
      const localDocument = documents.get(toLogicalRoute(url.pathname, nitro.options.baseURL))
      // Generated documents are already bounded by the configured sitemap.
      // Only fetched documents consume the untrusted traversal budget.
      if (!localDocument && (depth >= 3 || budget.fetched >= 100)) {
        if (!budget.warned) {
          logger.warn('Sitemap crawl reached its document limit.')
          budget.warned = true
        }
        continue
      }
      seen.add(url.href)
      if (!localDocument)
        budget.fetched++
      const content = localDocument?.() ?? await crawlerFetch(state)(`${url.pathname}${url.search}`, {
        headers: { 'x-nitro-prerender': url.pathname },
        retry: 0,
        signal: AbortSignal.timeout(PRERENDER_PAGE_TIMEOUT),
      }).catch((error) => {
        logger.warn(`Sitemap crawl failed for ${url.pathname}: ${String(error)}`)
        return null
      }) as string | null
      if (content)
        crawled += await crawlSitemapContent(state, nuxt, nitro, content, seen, depth + Number(!localDocument), documents, budget)
    }
    return crawled
  }
  const urls = result.document.entries
  logger.debug(`Found ${urls.length} URLs in sitemap`)
  return crawlSitemapEntries(state, nuxt, nitro, urls)
}

interface PrerenderSitemapConfig {
  sitemaps?: boolean | Record<string, { sitemapName?: string, _route?: string, route?: string }>
  sitemapName?: string
  sitemapsPathPrefix?: string
}

export async function crawlConfiguredSitemaps(state: CrawlerState, nuxt: Nuxt, nitro: Nitro, sitemap: PrerenderSitemapConfig, documents = new Map<string, () => string>()): Promise<void> {
  const names = state.llmsTxtConfig?.sitemaps
  const singleName = (sitemap.sitemapName || 'sitemap.xml').replace(/\.xml$/, '')
  const configured = sitemap.sitemaps && typeof sitemap.sitemaps === 'object' ? sitemap.sitemaps : undefined
  const roots = configured
    ? Object.entries(configured).flatMap(([key, definition]) => {
        const name = (definition.sitemapName || key).replace(/\.xml$/, '')
        if (key === 'index' || (names !== undefined && !names.includes(name)))
          return []
        const route = definition._route || definition.route || (key === 'chunks' ? configured.index?._route || configured.index?.route : undefined)
        return [route ? toLogicalRoute(route, nitro.options.baseURL) : joinURL(sitemap.sitemapsPathPrefix ?? '/__sitemap__/', `${name}.xml`)]
      })
    : names !== undefined && !names.includes(sitemap.sitemaps ? 'chunks' : singleName)
      ? []
      : [sitemap.sitemaps ? '/sitemap_index.xml' : `/${sitemap.sitemapName || 'sitemap.xml'}`]
  for (const root of roots) {
    const content = documents.get(root)?.() ?? await crawlerFetch(state)(toDeployedRoute(root, nitro.options.baseURL), {
      headers: { 'x-nitro-prerender': root },
      retry: 0,
      signal: AbortSignal.timeout(PRERENDER_PAGE_TIMEOUT),
    }).catch((error) => {
      // A missing sitemap leaves the explicit prerender route list as the source.
      logger.warn(`Sitemap crawl failed for ${root}: ${String(error)}`)
      return null
    }) as string | null
    if (content)
      await crawlSitemapContent(state, nuxt, nitro, content, new Set(), 0, documents)
  }
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

  // The sitemap module can serve sitemap.xml at runtime without prerendering it.
  // Only wait for its prerender hook when the build will actually render it.
  const hasSitemapModule = hasNuxtModule('@nuxtjs/sitemap', nuxt)

  let prerenderSitemap = isNuxtGenerate() || includesSitemapRoot(sitemapName, prerenderedRoutes)

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

async function prerenderRoute(nitro: Nitro, route: string, fetch: PrerenderFetch) {
  const filePath = resolvePrerenderFile(nitro.options.output.publicDir, route)
  const start = Date.now()
  const encodedRoute = encodeURI(route)
  const fetchUrl = withBase(encodedRoute, nitro.options.baseURL)

  const res = await fetch.raw(fetchUrl, {
    headers: { 'x-nitro-prerender': encodedRoute },
    retry: nitro.options.prerender.retry,
    retryDelay: nitro.options.prerender.retryDelay,
  })

  logger.debug(`Creating directory for prerender: ${dirname(filePath)}`)
  await mkdir(dirname(filePath), { recursive: true })

  const data = res._data
  if (data === undefined)
    throw new Error(`No data returned from '${fetchUrl}'`)

  logger.debug(`Writing prerendered file: ${filePath} (${((data as string).length / 1024).toFixed(1)}kb)`)
  await writeFile(filePath, data as string, 'utf8')

  const _route: PrerenderRoute = {
    route,
    // fileName is relative to the output public dir (nitro core convention);
    // presets key overrides/route exclusions off it, so an absolute path here
    // breaks e.g. the Vercel config.json overrides map.
    fileName: route,
    generateTimeMS: Date.now() - start,
  }
  nitro._prerenderedRoutes!.push(_route)

  return stat(filePath)
}

export interface PrerenderHandlerOptions {
  ftsTokenizer?: string
  i18n?: PrerenderI18nConfig | null
  /**
   * Agent skill artifact routes such as `/SKILL.md`. They are files served
   * verbatim, not markdown twins of a page, so the generate hook must leave
   * their bytes alone.
   */
  artifactRoutes?: readonly string[]
  /**
   * The runtime database restores itself from `pages.dump` and checks
   * `pages.meta.json` for a new build. Nothing else reads either file, so a
   * build without the database leaves them out of the public output.
   */
  runtimeDatabase: ResolvedDatabase['_tag']
}

export function setupPrerenderHandler(
  options: ModuleOptions,
  dbPath: string | undefined,
  siteInfo: SiteInfo | undefined,
  llmsTxtConfig: LlmsTxtConfig | undefined,
  extras: PrerenderHandlerOptions,
) {
  const nuxt = useNuxt()

  nuxt.hooks.hook('nitro:init', async (nitro: Nitro) => {
    // llms-full.txt is streamed directly to public dir
    const llmsFullTxtPath = options.llmsFullTxt === false ? undefined : join(nitro.options.output.publicDir, 'llms-full.txt')
    const state = createCrawlerState(
      dbPath,
      llmsFullTxtPath,
      siteInfo,
      llmsTxtConfig,
      options.prerender?.concurrency,
      extras.ftsTokenizer,
      extras.i18n,
    )
    let prerenderClient: ReturnType<typeof createPrerenderFetch> | undefined
    nitro.hooks.hook('prerender:init', (renderer) => {
      const major = getNitroVersion(nuxt)
      if (major !== 2 && major !== 3)
        throw new Error(`Unsupported Nitro prerender builder: ${major}`)
      prerenderClient = createPrerenderFetch(renderer, major)
      state.fetch = prerenderClient.fetch
    })
    let initPromise: Promise<void> | null = null
    const artifactRoutes = new Set(extras.artifactRoutes ?? [])

    nitro.hooks.hook('prerender:generate', async (route) => {
      // Track error routes for filtering in llms.txt
      if (route.error) {
        // Nitro file names are relative to the public output and already have
        // app.baseURL removed, unlike crawled route names which may be deployed.
        const routePath = route.fileName || route.route
        const pageRoute = withLeadingSlash(routePath)
          .replace(RE_HTML_MD_EXT, '')
          .replace(RE_INDEX_SUFFIX, '')
          .replace(RE_HTML_MD_EXT, '') || '/'
        state.errorRoutes.add(pageRoute)
        logger.debug(`Detected error page: ${pageRoute}`)
        return
      }

      if (route.fileName === SITEMAP_MD_ROUTE)
        return

      // An agent skill artifact carries its own frontmatter and no JSON
      // envelope. Parsing it as a page twin threw and dropped the file.
      if (artifactRoutes.has(route.route) || (route.fileName && artifactRoutes.has(withLeadingSlash(route.fileName)))) {
        route.contentType = 'text/markdown; charset=utf-8'
        return
      }

      if (!route.fileName?.endsWith('.md'))
        return

      let pageRoute = withLeadingSlash(route.fileName).replace(RE_MD_EXT, '')
      if (pageRoute === '/index')
        pageRoute = '/'

      const pageStartTime = Date.now()

      // Initialize on first page
      if (!initPromise)
        initPromise = initCrawler(state)
      await initPromise

      const parsed = JSON.parse(route.contents || '{}') as ParsedMarkdownResult
      if (!state.prerenderedRoutes.has(pageRoute))
        await processMarkdownRoute(state, nuxt, pageRoute, parsed)

      // The prerender middleware already wrote frontmatter via mdream's
      // additionalFields, so write the markdown straight to disk.
      const withSitemap = options.sitemapMd === false
        ? parsed.markdown
        : appendSitemapSection(parsed.markdown, absoluteSiteUrl(toDeployedRoute(SITEMAP_MD_ROUTE, nitro.options.baseURL), siteInfo?.url))
      route.contents = llmsTxtConfig?.directive?.markdown === false
        ? withSitemap
        : insertLlmsTxtDirective(withSitemap, absoluteSiteUrl(toDeployedRoute('/llms.txt', nitro.options.baseURL), siteInfo?.url))
      route.contentType = 'text/markdown; charset=utf-8'
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
            updatedAt: '',
            isError: true,
            locale: resolveRouteLocale(route, state.i18n),
          })
        }
        logger.debug(`Wrote ${state.errorRoutes.size} error routes to database`)
      }

      // Write page data JSON for runtime access
      const publicDataDir = join(nitro.options.output.publicDir, '__ai-ready')
      logger.debug(`Creating __ai-ready public directory: ${publicDataDir}`)
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
        logger.debug(`Writing pages.json: ${publicJsonPath} (${(jsonContent.length / 1024).toFixed(1)}kb)`)
        await writeFile(publicJsonPath, jsonContent, 'utf-8')
        logger.debug(`Wrote ${pages.length} pages to __ai-ready/pages.json`)

        if (extras.runtimeDatabase === 'Enabled') {
          // Export database dump for serverless restore (streams in batches internally)
          const dumpData = await exportDbDump(state.db)
          const dumpPath = join(publicDataDir, 'pages.dump')
          logger.debug(`Writing pages.dump: ${dumpPath} (${(dumpData.length / 1024).toFixed(1)}kb)`)
          await writeFile(dumpPath, dumpData, 'utf-8')
          logger.debug(`Created database dump at __ai-ready/pages.dump (${(dumpData.length / 1024).toFixed(1)}kb compressed)`)

          // Write build metadata for runtime stale detection.
          const buildId = Date.now().toString(36)
          const metaContent = JSON.stringify({
            buildId,
            pageCount: pages.length,
            createdAt: new Date().toISOString(),
          })
          logger.debug(`Writing pages.meta.json (${(metaContent.length / 1024).toFixed(1)}kb)`)
          await writeFile(join(publicDataDir, 'pages.meta.json'), metaContent, 'utf-8')
          logger.debug(`Wrote build metadata: buildId=${buildId}`)
        }
      }

      // Record only Markdown URLs that will actually be available after
      // deployment. The prerendered llms.txt route reads this build-only file.
      if (state.dbPath && state.llmsTxtConfig?.markdownLinks) {
        const availabilityFile = join(dirname(state.dbPath), MARKDOWN_LINK_AVAILABILITY_FILE)
        // Nitro 3 deprecates `srcDir` and leaves it unset; its ignore
        // patterns resolve from `serverDir`, which may be `false`.
        const options = nitro.options as typeof nitro.options & { serverDir?: string | false }
        const ignoreBaseDir = options.srcDir || (typeof options.serverDir === 'string' ? options.serverDir : undefined) || options.rootDir
        const paths = await findOutputMarkdownPaths(
          nitro.options.output.publicDir,
          nitro.options.baseURL,
          ignoreBaseDir,
          nitro.options.ignore,
          nitro.options.publicAssets,
        )
        await writeFile(availabilityFile, JSON.stringify({
          runtimeMarkdownAvailable: !nitro.options.static,
          paths,
        }), 'utf-8')
      }

      // Traverse the generated file tree so static output contains every linked child.
      let llmsSize = 0
      if (options.llmsTxt !== false) {
        const seen = new Set<string>()
        const pending = ['/llms.txt']
        while (pending.length) {
          const route = pending.shift()!
          if (seen.has(route))
            continue
          seen.add(route)
          const stats = await prerenderRoute(nitro, route, crawlerFetch(state))
          llmsSize += stats.size
          const body = await readFile(resolvePrerenderFile(nitro.options.output.publicDir, route), 'utf-8')
          for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
            const origin = new URL(siteInfo?.url || 'http://localhost').origin
            const parsedTarget = parsePrerenderRoute(match[1]!, nitro.options.baseURL)
            if (parsedTarget._tag === 'Invalid')
              continue
            const target = new URL(match[1]!, origin)
            if (target.origin !== origin)
              continue
            const path = parsedTarget.route
            if (/^\/llms\/[^/]+\.txt$/i.test(path))
              pending.push(path)
          }
        }
      }
      const llmsFullStats = state.llmsFullTxtPath ? await stat(state.llmsFullTxtPath) : { size: 0 }
      // The streamed file must still be registered as a prerendered route:
      // otherwise presets keep the runtime handler's route, and on Vercel that
      // function output shadows the static file (nuxt/scripts#825).
      if (state.llmsFullTxtPath)
        nitro._prerenderedRoutes!.push({ route: '/llms-full.txt', fileName: '/llms-full.txt' })

      if (options.sitemapMd !== false) {
        const sitemapMdStats = await prerenderRoute(nitro, SITEMAP_MD_ROUTE, crawlerFetch(state))
        logger.debug(`Wrote sitemap.md (${(sitemapMdStats.size / 1024).toFixed(1)}kb)`)
      }

      const kb = (b: number) => (b / 1024).toFixed(1)
      const totalKb = kb(llmsSize + llmsFullStats.size)
      const dim = (s: string) => colorize('dim', s)
      const cyan = (s: string) => colorize('cyan', s)
      const timeStr = state.totalProcessingTime >= 100 ? ` in ${cyan(`${(state.totalProcessingTime / 1000).toFixed(1)}s`)}` : ''
      logger.info(`Indexed ${cyan(String(state.prerenderedRoutes.size))} pages for llms.txt${timeStr} → ${cyan(`${totalKb}kb`)}`)
      logger.info(dim(`  llms.txt files: ${kb(llmsSize)}kb, llms-full.txt: ${kb(llmsFullStats.size)}kb`))
    }

    const { useSitemapHook, usePrerenderHook } = detectSitemapPrerender()
    logger.debug(`Prerender hooks: sitemap=${useSitemapHook}, prerender=${usePrerenderHook}`)

    if (useSitemapHook) {
      // sitemap:prerender:done fires after sitemap.xml is written
      nuxt.hooks.hook('sitemap:prerender:done' as any, async (ctx: { options: PrerenderSitemapConfig, sitemaps: Array<{ name: string, content: string }> }) => (async () => {
        if (!state.initialized)
          return

        // Follow selected roots, not every generated document or the global index.
        // A chunk inherits admission through its selected parent sitemap.
        const documents = new Map(ctx.sitemaps.map(sitemap => [toLogicalRoute(sitemap.name, nitro.options.baseURL), () => sitemap.content]))
        await crawlConfiguredSitemaps(state, nuxt, nitro, ctx.options, documents)

        await writeLlmsFiles()
        state.prerenderedRoutes.clear()
        if (state.db)
          await state.db.close?.()
      })().finally(() => prerenderClient?.close()))
    }
    else if (usePrerenderHook) {
      nitro.hooks.hook('prerender:done', async () => (async () => {
        if (!state.initialized)
          return

        await crawlConfiguredSitemaps(state, nuxt, nitro, (nuxt.options.sitemap || {}) as PrerenderSitemapConfig)

        await writeLlmsFiles()
        state.prerenderedRoutes.clear()
        if (state.db)
          await state.db.close?.()
      })().finally(() => prerenderClient?.close()))
    }
  })
}
