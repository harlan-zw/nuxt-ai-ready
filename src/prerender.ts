import type { Nuxt } from '@nuxt/schema'
import type { Nitro, PrerenderRoute } from 'nitropack/types'
import type { LlmsTxtConfig, LlmsTxtLink, LlmsTxtSection } from './runtime/types'
import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { useNuxt } from '@nuxt/kit'
import { parseSitemapXml } from '@nuxtjs/sitemap/utils'
import { colorize } from 'consola/utils'
import { withBase } from 'ufo'
import { logger } from './logger'

// Inline normalization functions to avoid runtime deps
function normalizeLink(link: LlmsTxtLink): string {
  const parts: string[] = []
  parts.push(`- [${link.title}](${link.href})`)
  if (link.description)
    parts.push(`  ${link.description}`)
  return parts.join('\n')
}

function normalizeSection(section: LlmsTxtSection): string {
  const parts: string[] = []
  parts.push(`## ${section.title}`)
  parts.push('')
  if (section.description) {
    const descriptions = Array.isArray(section.description) ? section.description : [section.description]
    parts.push(...descriptions)
    parts.push('')
  }
  if (section.links?.length)
    parts.push(...section.links.map(normalizeLink))
  return parts.join('\n')
}

function normalizeLlmsTxtConfig(config: LlmsTxtConfig): string {
  const parts: string[] = []
  if (config.sections?.length)
    parts.push(...config.sections.map(normalizeSection))
  if (config.notes) {
    parts.push('## Notes')
    parts.push('')
    const notes = Array.isArray(config.notes) ? config.notes : [config.notes]
    parts.push(...notes)
  }
  return parts.join('\n\n')
}

export interface ParsedMarkdownResult {
  markdown: string
  title: string
  description: string
  headings: Array<Record<string, string>>
  updatedAt?: string
}

interface SitemapEntry {
  loc: string
  lastmod?: string | Date
}

export interface SiteInfo {
  name?: string
  url?: string
  description?: string
}

export interface CrawlerState {
  prerenderedRoutes: Set<string>
  totalProcessingTime: number
  initialized: boolean
  jsonlInitialized: boolean
  pageDataPath?: string
  llmsFullTxtPath?: string
  siteInfo?: SiteInfo
  llmsTxtConfig?: LlmsTxtConfig
}

export function createCrawlerState(
  pageDataPath?: string,
  llmsFullTxtPath?: string,
  siteInfo?: SiteInfo,
  llmsTxtConfig?: LlmsTxtConfig,
): CrawlerState {
  return {
    prerenderedRoutes: new Set(),
    totalProcessingTime: 0,
    initialized: false,
    jsonlInitialized: false,
    pageDataPath,
    llmsFullTxtPath,
    siteInfo,
    llmsTxtConfig,
  }
}

function buildLlmsFullTxtHeader(siteInfo?: SiteInfo, llmsTxtConfig?: LlmsTxtConfig): string {
  const parts: string[] = []

  // Header
  parts.push(`# ${siteInfo?.name || siteInfo?.url || 'Site'}`)
  if (siteInfo?.description)
    parts.push(`\n> ${siteInfo.description}`)
  if (siteInfo?.url)
    parts.push(`\nCanonical Origin: ${siteInfo.url}`)
  parts.push('')

  // Sections (LLM Resources, etc)
  if (llmsTxtConfig) {
    const normalizedContent = normalizeLlmsTxtConfig(llmsTxtConfig)
    if (normalizedContent) {
      parts.push(normalizedContent)
      parts.push('')
    }
  }

  parts.push('## Pages\n\n')
  return parts.join('\n')
}

export async function initCrawler(state: CrawlerState): Promise<void> {
  if (state.initialized)
    return
  if (state.pageDataPath) {
    await mkdir(dirname(state.pageDataPath), { recursive: true })
    await writeFile(state.pageDataPath, '', 'utf-8')
    state.jsonlInitialized = true
    logger.debug(`Crawler initialized with JSONL at ${state.pageDataPath}`)
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

function stripFrontmatter(markdown: string): string {
  // Remove YAML frontmatter (---\n...\n---)
  return markdown.replace(/^---\n[\s\S]*?\n---\n*/, '')
}

function normalizeHeadings(markdown: string): string {
  // Convert headings to plain text with level prefix: # Title -> h1. Title
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  return markdown.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, text) => {
    const level = hashes.length
    return `h${level}. ${text}`
  })
}

function formatPageForLlmsFullTxt(route: string, title: string, description: string, markdown: string, siteUrl?: string): string {
  const canonicalUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}${route}` : route
  const heading = title && title !== route ? `### ${title}` : `### ${route}`

  // Clean markdown: strip frontmatter and normalize headings
  let content = stripFrontmatter(markdown)
  content = normalizeHeadings(content)

  const parts = [heading, '']
  parts.push(`Source: ${canonicalUrl}`)
  if (description)
    parts.push(`Description: ${description}`)
  parts.push('')
  if (content.trim()) {
    parts.push(content.trim())
    parts.push('')
  }
  parts.push('---')
  parts.push('') // blank line after separator

  return `${parts.join('\n')}\n`
}

async function processMarkdownRoute(
  state: CrawlerState,
  nuxt: Nuxt,
  route: string,
  parsed: ParsedMarkdownResult,
  lastmod?: string | Date,
  options?: { skipLlmsFullTxt?: boolean },
): Promise<void> {
  const { markdown, title, description, headings, updatedAt: metaUpdatedAt } = parsed

  let updatedAt = (lastmod instanceof Date ? lastmod.toISOString() : lastmod) || new Date().toISOString()
  if (metaUpdatedAt) {
    const parsedDate = new Date(metaUpdatedAt)
    if (!Number.isNaN(parsedDate.getTime()))
      updatedAt = parsedDate.toISOString()
  }

  await nuxt.hooks.callHook('ai-ready:page:markdown', { route, markdown, title, description, headings })

  if (state.jsonlInitialized && state.pageDataPath) {
    const pageData = {
      route,
      title,
      description,
      headings: flattenHeadings(headings),
      updatedAt,
      markdown,
    }
    await appendFile(state.pageDataPath, `${JSON.stringify(pageData)}\n`, 'utf-8')
  }

  // Stream-append to llms-full.txt (skip for sitemap-only crawled pages)
  if (state.llmsFullTxtPath && !options?.skipLlmsFullTxt) {
    const pageContent = formatPageForLlmsFullTxt(route, title, description, markdown, state.siteInfo?.url)
    await appendFile(state.llmsFullTxtPath, pageContent, 'utf-8')
  }

  state.prerenderedRoutes.add(route)
}

export async function crawlSitemapEntries(
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

    const res = await globalThis.$fetch(mdUrl, {
      headers: { 'x-nitro-prerender': mdRoute },
    }).catch((err) => {
      logger.debug(`Failed to fetch ${mdUrl}: ${err.message}`)
      return null
    }) as string | null

    if (!res)
      continue

    const parsed = JSON.parse(res) as ParsedMarkdownResult
    // Skip llms-full.txt for sitemap-crawled pages - only include prerendered pages
    await processMarkdownRoute(state, nuxt, route, parsed, lastmod, { skipLlmsFullTxt: true })
    crawled++
  }

  logger.debug(`Sitemap crawl complete: ${crawled} crawled, ${skipped} skipped (already indexed)`)
  return crawled
}

export async function crawlSitemapContent(
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
  pageDataPath?: string,
  siteInfo?: SiteInfo,
  llmsTxtConfig?: LlmsTxtConfig,
) {
  const nuxt = useNuxt()

  nuxt.hooks.hook('nitro:init', async (nitro: Nitro) => {
    // llms-full.txt is streamed directly to public dir
    const llmsFullTxtPath = join(nitro.options.output.publicDir, 'llms-full.txt')
    const state = createCrawlerState(pageDataPath, llmsFullTxtPath, siteInfo, llmsTxtConfig)
    let initPromise: Promise<void> | null = null

    nitro.hooks.hook('prerender:generate', async (route) => {
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
      const { markdown, title, description, headings, updatedAt: metaUpdatedAt } = parsed

      // Get timestamp from meta tag or use current time
      let updatedAt = new Date().toISOString()
      if (metaUpdatedAt) {
        const parsedDate = new Date(metaUpdatedAt)
        if (!Number.isNaN(parsedDate.getTime()))
          updatedAt = parsedDate.toISOString()
      }

      await nuxt.hooks.callHook('ai-ready:page:markdown', {
        route: pageRoute,
        markdown,
        title,
        description,
        headings,
      })

      // Write to JSONL for virtual module
      if (state.jsonlInitialized && state.pageDataPath) {
        const pageData = {
          route: pageRoute,
          title,
          description,
          headings: flattenHeadings(headings),
          updatedAt,
          markdown,
        }
        await appendFile(state.pageDataPath, `${JSON.stringify(pageData)}\n`, 'utf-8')
      }

      // Stream-append to llms-full.txt
      if (state.llmsFullTxtPath) {
        const pageContent = formatPageForLlmsFullTxt(pageRoute, title, description, markdown, state.siteInfo?.url)
        await appendFile(state.llmsFullTxtPath, pageContent, 'utf-8')
      }

      state.prerenderedRoutes.add(pageRoute)
      route.contents = markdown
      state.totalProcessingTime += Date.now() - pageStartTime
    })

    async function writeLlmsFiles() {
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
