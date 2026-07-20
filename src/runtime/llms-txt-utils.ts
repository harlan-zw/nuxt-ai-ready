import type { H3Event } from 'h3'
import type { PageEntry } from './server/db/queries'
import type { RuntimeI18nConfig } from './server/utils/i18n'
import type { LlmsTxtConfig } from './types'
import { useRuntimeConfig } from 'nitropack/runtime'
import { getSiteConfig } from '#site-config/server/composables/getSiteConfig'
import { withSiteTrailingSlash, withSiteUrl } from '#site-config/server/composables/utils'
import { formatAvailableLanguagesSection, formatLlmsTxtPageLink, normalizeLlmsTxtConfig } from './llms-txt-format'
import { normalizePersistedRoute, toDeployedRoute, toLogicalRoute } from './route-path'
import { queryPages } from './server/db/queries'
import { logger } from './server/logger'
import { resolveLocaleFromRoute } from './server/utils/i18n'
import { fetchSitemapUrls } from './server/utils/sitemap'

export { normalizeLlmsTxtConfig }

interface PageItem {
  pathname: string
  href?: string
  title?: string
  description?: string
  locale?: string
}

/**
 * Get group prefix for a URL (1 or 2 segments)
 */
function getGroupPrefix(url: string, depth: 1 | 2): string {
  const segments = url.split('/').filter(Boolean)
  if (segments.length === 0)
    return '/'
  if (depth === 1 || segments.length === 1)
    return `/${segments[0]}`
  return `/${segments[0]}/${segments[1]}`
}

function getPathSegments(pathname: string): string[] {
  return pathname.split('/').filter((s): s is string => Boolean(s))
}

interface GroupAnalysis {
  twoSegmentCount: Map<string, number>
  segmentHasNested: Map<string, boolean>
}

function analyzePageGroups(pages: PageItem[]): GroupAnalysis {
  const twoSegmentCount = new Map<string, number>()
  const segmentHasNested = new Map<string, boolean>()

  for (const page of pages) {
    const prefix = getGroupPrefix(page.pathname, 2)
    twoSegmentCount.set(prefix, (twoSegmentCount.get(prefix) || 0) + 1)

    const segments = getPathSegments(page.pathname)
    const firstSegment = segments[0] || ''
    if (!segmentHasNested.has(firstSegment))
      segmentHasNested.set(firstSegment, false)
    if (segments.length > 1)
      segmentHasNested.set(firstSegment, true)
  }

  return { twoSegmentCount, segmentHasNested }
}

function getPageGroupKey(pathname: string, { twoSegmentCount, segmentHasNested }: GroupAnalysis): string {
  const segments = getPathSegments(pathname)
  const firstSegment = segments[0] || ''

  const twoSegPrefix = getGroupPrefix(pathname, 2)
  const twoSegCount = twoSegmentCount.get(twoSegPrefix) || 0
  let groupKey = twoSegCount > 1 ? twoSegPrefix : `/${firstSegment}`

  if (segments.length <= 1 && !segmentHasNested.get(firstSegment))
    groupKey = ''

  return groupKey
}

/**
 * Sort pages by URL path in hierarchical order (directory tree structure)
 * Groups by up to 2 segments, with root-level pages without nesting grouped together
 */
function sortPagesByPath(pages: PageItem[]): PageItem[] {
  const analysis = analyzePageGroups(pages)

  return pages.sort((a, b) => {
    const segmentsA = getPathSegments(a.pathname)
    const segmentsB = getPathSegments(b.pathname)

    const groupKeyA = getPageGroupKey(a.pathname, analysis)
    const groupKeyB = getPageGroupKey(b.pathname, analysis)

    // Root group (empty string) comes first
    if (groupKeyA === '' && groupKeyB !== '')
      return -1
    if (groupKeyA !== '' && groupKeyB === '')
      return 1

    // If in different groups, sort by group key
    if (groupKeyA !== groupKeyB)
      return groupKeyA.localeCompare(groupKeyB)

    // Within same group, sort by full URL path
    // Root (/) always comes first within root group
    if (segmentsA.length === 0)
      return -1
    if (segmentsB.length === 0)
      return 1

    // Compare segment by segment
    const minLen = Math.min(segmentsA.length, segmentsB.length)
    for (let i = 0; i < minLen; i++) {
      const cmp = segmentsA[i]!.localeCompare(segmentsB[i]!)
      if (cmp !== 0)
        return cmp
    }

    // If all compared segments are equal, shorter path comes first
    return segmentsA.length - segmentsB.length
  })
}

/**
 * Format sorted pages with group separators (blank lines between groups)
 */
function formatPagesWithGroups(pages: PageItem[]): string[] {
  if (pages.length === 0)
    return []

  const analysis = analyzePageGroups(pages)
  const lines: string[] = []
  let currentGroup = ''
  let segmentGroupIndex = 0
  let urlsInCurrentGroup = 0

  for (const page of pages) {
    const groupKey = getPageGroupKey(page.pathname, analysis)

    // Detect group change
    if (groupKey !== currentGroup) {
      // Add blank line after previous group based on rules
      if (urlsInCurrentGroup > 0) {
        const shouldAddBlankLine = segmentGroupIndex === 0 // Always after first group
          || (segmentGroupIndex >= 1 && segmentGroupIndex <= 2 && urlsInCurrentGroup > 1) // Groups 2-3 if > 1 URL

        if (shouldAddBlankLine)
          lines.push('')
      }

      currentGroup = groupKey
      segmentGroupIndex++
      urlsInCurrentGroup = 0
    }

    urlsInCurrentGroup++

    lines.push(formatLlmsTxtPageLink(page))
  }

  return lines
}

export async function buildLlmsTxt(event: H3Event) {
  const runtimeConfig = useRuntimeConfig(event)
  const aiReadyConfig = runtimeConfig['nuxt-ai-ready'] as any
  const sitemapConfig = runtimeConfig.sitemap as { sitemaps?: Record<string, { sitemapName: string }> } | undefined
  const siteConfig = getSiteConfig(event)
  const llmsTxtConfig = aiReadyConfig.llmsTxt as LlmsTxtConfig
  const i18n = aiReadyConfig.i18n as RuntimeI18nConfig | null | undefined
  const baseURL = runtimeConfig.app.baseURL
  const resolvePath = (path: string) => withSiteTrailingSlash(event, toDeployedRoute(path, baseURL))
  const resolveUrl = (path: string) => withSiteUrl(event, toDeployedRoute(path, baseURL))
  const canonicalSiteUrl = siteConfig.url
    ? resolveUrl('/')
    : undefined

  const parts: string[] = []

  // Header
  parts.push(`# ${siteConfig.name || canonicalSiteUrl}`)
  if (siteConfig.description) {
    parts.push(`\n> ${siteConfig.description}`)
  }
  if (canonicalSiteUrl) {
    parts.push(`\nCanonical Origin: ${canonicalSiteUrl}`)
  }

  parts.push('')

  // Add sitemap and robots.txt to the first section (LLM Resources)
  const sections = llmsTxtConfig.sections?.map(section => ({
    ...section,
    links: section.links ? [...section.links] : undefined,
  })) ?? []
  if (sections[0]?.links) {
    const sitemapRoutes = sitemapConfig?.sitemaps
      ? Object.values(sitemapConfig.sitemaps).map(s => s.sitemapName)
      : ['sitemap.xml']
    for (const name of sitemapRoutes) {
      sections[0].links.push({
        title: name,
        href: resolveUrl(`/${name}`),
        description: 'XML sitemap for search engines and crawlers.',
      })
    }
    sections[0].links.push({
      title: 'robots.txt',
      href: resolveUrl('/robots.txt'),
      description: 'Crawler rules and permissions.',
    })
  }

  // Sections (LLM Resources, etc)
  const normalizedContent = normalizeLlmsTxtConfig({ ...llmsTxtConfig, sections })
  if (normalizedContent) {
    parts.push(normalizedContent)
    parts.push('')
  }

  // Pages section - combine prerendered pages + sitemap (SSR)
  // Fetch pages (excludes errors by default) and sitemap URLs in parallel.
  // A database failure (e.g. read-only filesystem) must not 500 the route:
  // degrade to sitemap-only pages so llms.txt still lists discoverable URLs.
  const urlsPromise = fetchSitemapUrls(event)
  let pages: PageEntry[] = []
  let errorPages: PageEntry[] = []
  try {
    ;[pages, errorPages] = await Promise.all([
      queryPages(event) as Promise<PageEntry[]>,
      queryPages(event, { where: { hasError: true } }) as Promise<PageEntry[]>,
    ])
  }
  catch (err) {
    logger.warn(
      `[ai-ready] Database unavailable for llms.txt, falling back to sitemap-only pages: `
      + `${err instanceof Error ? err.message : String(err)}`,
    )
  }
  const urls = await urlsPromise
  const sitemapPaths = urls.map(url => toLogicalRoute(url.loc, baseURL))
  const sitemapPathSet = new Set(sitemapPaths)

  // Build prerendered list and track seen/error paths
  const seenPaths = new Set<string>()
  const errorSet = new Set(errorPages.map(p => normalizePersistedRoute(p.route, sitemapPathSet, baseURL)))
  const prerendered: PageItem[] = []

  for (const page of pages) {
    const pathname = normalizePersistedRoute(page.route, sitemapPathSet, baseURL)
    if (seenPaths.has(pathname))
      continue
    seenPaths.add(pathname)
    prerendered.push({ pathname, title: page.title, description: page.description, locale: page.locale })
  }

  const devModeHint = import.meta.dev && prerendered.length === 0 ? ' (dev mode - run `nuxi generate` for page titles)' : ''

  // Collect SSR pages from sitemap that weren't prerendered
  // Filter out error routes detected during prerender
  const other: PageItem[] = []
  for (const pathname of sitemapPaths) {
    if (!seenPaths.has(pathname) && !errorSet.has(pathname)) {
      const locale = i18n ? resolveLocaleFromRoute(pathname, i18n).locale : undefined
      other.push({ pathname, locale })
      seenPaths.add(pathname)
    }
  }

  for (const page of [...prerendered, ...other])
    page.href = resolvePath(page.pathname)

  // i18n: filter to default-locale pages, then emit Available Languages header
  if (i18n) {
    const pageCounts = new Map<string, number>()
    for (const locale of i18n.locales) pageCounts.set(locale.code, 0)
    for (const p of [...prerendered, ...other]) {
      const code = p.locale || resolveLocaleFromRoute(p.pathname, i18n).locale
      pageCounts.set(code, (pageCounts.get(code) ?? 0) + 1)
    }
    parts.push(...formatAvailableLanguagesSection(i18n, pageCounts, resolvePath))
    parts.push('')
  }

  // When i18n active, default-locale pages are inlined; non-default-locale pages
  // are referenced via the Available Languages section above (Anthropic precedent).
  const isDefaultLocale = (item: PageItem): boolean => {
    if (!i18n)
      return true
    const code = item.locale || resolveLocaleFromRoute(item.pathname, i18n).locale
    return code === i18n.defaultLocale
  }

  const filteredPrerendered = i18n ? prerendered.filter(isDefaultLocale) : prerendered
  const filteredOther = i18n ? other.filter(isDefaultLocale) : other

  // Sort and format pages
  const sortedPrerendered = sortPagesByPath(filteredPrerendered)
  const sortedOther = sortPagesByPath(filteredOther)

  if (sortedPrerendered.length > 0 && sortedOther.length > 0) {
    parts.push(`## Prerendered Pages${devModeHint}\n`)
    parts.push(...formatPagesWithGroups(sortedPrerendered))
    parts.push('')
    parts.push('## Other Pages\n')
    parts.push(...formatPagesWithGroups(sortedOther))
    parts.push('')
  }
  else if (sortedPrerendered.length > 0) {
    parts.push(`## Pages${devModeHint}\n`)
    parts.push(...formatPagesWithGroups(sortedPrerendered))
    parts.push('')
  }
  else if (sortedOther.length > 0) {
    parts.push(`## Pages${devModeHint}\n`)
    parts.push(...formatPagesWithGroups(sortedOther))
    parts.push('')
  }

  return parts.join('\n')
}
