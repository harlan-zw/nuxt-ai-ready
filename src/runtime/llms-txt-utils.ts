import type { H3Event } from 'h3'
import type { LlmsTxtConfig, LlmsTxtLink, LlmsTxtSection } from './types'
import { getSiteConfig } from '#site-config/server/composables/getSiteConfig'
import { useRuntimeConfig } from 'nitropack/runtime'
import { getErrorRoutes, getPages } from './server/utils/pageData'
import { fetchSitemapUrls } from './server/utils/sitemap'

interface PageItem {
  pathname: string
  title?: string
  description?: string
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

/**
 * Sort pages by URL path in hierarchical order (directory tree structure)
 * Groups by up to 2 segments, with root-level pages without nesting grouped together
 */
function sortPagesByPath(pages: PageItem[]): PageItem[] {
  // Count URLs per 2-segment prefix
  const twoSegmentCount = new Map<string, number>()
  for (const page of pages) {
    const prefix = getGroupPrefix(page.pathname, 2)
    twoSegmentCount.set(prefix, (twoSegmentCount.get(prefix) || 0) + 1)
  }

  // Analyze which first segments have nested paths
  const segmentHasNested = new Map<string, boolean>()
  for (const page of pages) {
    const segments = getPathSegments(page.pathname)
    const firstSegment = segments[0] || ''

    if (!segmentHasNested.has(firstSegment))
      segmentHasNested.set(firstSegment, false)

    if (segments.length > 1)
      segmentHasNested.set(firstSegment, true)
  }

  return pages.sort((a, b) => {
    const segmentsA = getPathSegments(a.pathname)
    const segmentsB = getPathSegments(b.pathname)

    const firstSegmentA = segmentsA[0] || ''
    const firstSegmentB = segmentsB[0] || ''

    // Determine group key: try 2-segment prefix first
    const twoSegPrefixA = getGroupPrefix(a.pathname, 2)
    const twoSegPrefixB = getGroupPrefix(b.pathname, 2)
    const twoSegCountA = twoSegmentCount.get(twoSegPrefixA) || 0
    const twoSegCountB = twoSegmentCount.get(twoSegPrefixB) || 0

    // Use 2-segment prefix if it has > 1 URL, otherwise fall back to 1-segment
    let groupKeyA = twoSegCountA > 1 ? twoSegPrefixA : `/${firstSegmentA}`
    let groupKeyB = twoSegCountB > 1 ? twoSegPrefixB : `/${firstSegmentB}`

    // Root-level pages without nested paths go in root group
    const isRootLevelA = segmentsA.length <= 1
    const isRootLevelB = segmentsB.length <= 1
    const hasNestedA = segmentHasNested.get(firstSegmentA)
    const hasNestedB = segmentHasNested.get(firstSegmentB)

    if (isRootLevelA && !hasNestedA)
      groupKeyA = ''
    if (isRootLevelB && !hasNestedB)
      groupKeyB = ''

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
 * Get the group key for a page (for adding blank lines between groups)
 */
function getPageGroupKey(pathname: string, twoSegmentCount: Map<string, number>, segmentHasNested: Map<string, boolean>): string {
  const segments = getPathSegments(pathname)
  const firstSegment = segments[0] || ''

  const twoSegPrefix = getGroupPrefix(pathname, 2)
  const twoSegCount = twoSegmentCount.get(twoSegPrefix) || 0
  let groupKey = twoSegCount > 1 ? twoSegPrefix : `/${firstSegment}`

  const isRootLevel = segments.length <= 1
  const hasNested = segmentHasNested.get(firstSegment)
  if (isRootLevel && !hasNested)
    groupKey = ''

  return groupKey
}

/**
 * Format sorted pages with group separators (blank lines between groups)
 */
function formatPagesWithGroups(pages: PageItem[]): string[] {
  if (pages.length === 0)
    return []

  // Build group analysis maps
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

  const lines: string[] = []
  let currentGroup = ''
  let segmentGroupIndex = 0
  let urlsInCurrentGroup = 0

  for (const page of pages) {
    const groupKey = getPageGroupKey(page.pathname, twoSegmentCount, segmentHasNested)

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

    // Format page line
    const descText = page.description ? `: ${page.description.substring(0, 160)}${page.description.length > 160 ? '...' : ''}` : ''
    if (page.title && page.title !== page.pathname)
      lines.push(`- [${page.title}](${page.pathname})${descText}`)
    else
      lines.push(`- ${page.pathname}${descText}`)
  }

  return lines
}

/**
 * Normalize a link to markdown format
 */
function normalizeLink(link: LlmsTxtLink): string {
  const parts: string[] = []
  parts.push(`- [${link.title}](${link.href})`)
  if (link.description) {
    parts.push(`  ${link.description}`)
  }
  return parts.join('\n')
}

/**
 * Normalize a section to markdown format
 */
function normalizeSection(section: LlmsTxtSection): string {
  const parts: string[] = []

  // Add title
  parts.push(`## ${section.title}`)
  parts.push('')

  // Add description (support both string and array of paragraphs)
  if (section.description) {
    const descriptions = Array.isArray(section.description)
      ? section.description
      : [section.description]
    parts.push(...descriptions)
    parts.push('')
  }

  // Add links
  if (section.links?.length) {
    parts.push(...section.links.map(normalizeLink))
  }

  return parts.join('\n')
}

/**
 * Normalize llms.txt structured configuration to markdown string
 */
export function normalizeLlmsTxtConfig(config: LlmsTxtConfig): string {
  const parts: string[] = []

  // Add sections
  if (config.sections?.length) {
    parts.push(...config.sections.map(normalizeSection))
  }

  // Add notes section (always at the end)
  if (config.notes) {
    parts.push('## Notes')
    parts.push('')
    const notes = Array.isArray(config.notes) ? config.notes : [config.notes]
    parts.push(...notes)
  }

  return parts.join('\n\n')
}

export async function buildLlmsTxt(event: H3Event) {
  const runtimeConfig = useRuntimeConfig(event)
  const aiReadyConfig = runtimeConfig['nuxt-ai-ready'] as any
  const sitemapConfig = runtimeConfig.sitemap as { sitemaps?: Record<string, { sitemapName: string }> } | undefined
  const siteConfig = getSiteConfig(event)
  const llmsTxtConfig = aiReadyConfig.llmsTxt as LlmsTxtConfig

  const parts: string[] = []

  // Header
  parts.push(`# ${siteConfig.name || siteConfig.url}`)
  if (siteConfig.description) {
    parts.push(`\n> ${siteConfig.description}`)
  }
  if (siteConfig.url) {
    parts.push(`\nCanonical Origin: ${siteConfig.url}`)
  }

  parts.push('')

  // Add sitemap and robots.txt to the first section (LLM Resources)
  const sections = llmsTxtConfig.sections ? [...llmsTxtConfig.sections] : []
  if (sections[0]?.links) {
    if (sitemapConfig?.sitemaps) {
      const sitemapRoutes = Object.values(sitemapConfig.sitemaps).map(s => s.sitemapName)
      for (const name of sitemapRoutes) {
        sections[0].links.push({ title: name, href: `/${name}`, description: 'XML sitemap for search engines and crawlers.' })
      }
    }
    sections[0].links.push({ title: 'robots.txt', href: '/robots.txt', description: 'Crawler rules and permissions.' })
  }

  // Sections (LLM Resources, etc)
  const normalizedContent = normalizeLlmsTxtConfig({ ...llmsTxtConfig, sections })
  if (normalizedContent) {
    parts.push(normalizedContent)
    parts.push('')
  }

  // Pages section - combine prerendered pages + sitemap (SSR)
  const pages = await getPages()
  const urls = await fetchSitemapUrls(event)
  const errorRoutes = await getErrorRoutes()
  const devModeHint = import.meta.dev && pages.size === 0 ? ' (dev mode - run `nuxi generate` for page titles)' : ''

  // Collect prerendered pages (these have titles)
  const prerendered: PageItem[] = []
  const seenPaths = new Set<string>()

  for (const [pathname, page] of pages) {
    prerendered.push({ pathname, title: page.title, description: page.description })
    seenPaths.add(pathname)
  }

  // Collect SSR pages from sitemap that weren't prerendered
  // Filter out error routes detected during prerender
  const other: PageItem[] = []
  for (const url of urls) {
    const pathname = url.loc.startsWith('http') ? new URL(url.loc).pathname : url.loc
    if (!seenPaths.has(pathname) && !errorRoutes.has(pathname)) {
      other.push({ pathname })
      seenPaths.add(pathname)
    }
  }

  // Sort and format pages
  const sortedPrerendered = sortPagesByPath(prerendered)
  const sortedOther = sortPagesByPath(other)

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
