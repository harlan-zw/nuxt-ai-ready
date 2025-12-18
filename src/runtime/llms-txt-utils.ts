import type { H3Event } from 'h3'
import type { LlmsTxtConfig, LlmsTxtLink, LlmsTxtSection } from './types'
import { getSiteConfig } from '#site-config/server/composables/getSiteConfig'
import { useRuntimeConfig } from 'nitropack/runtime'
import { getPages } from './server/utils/pageData'
import { fetchSitemapUrls } from './server/utils/sitemap'

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
  const devModeHint = import.meta.dev && pages.size === 0 ? ' (dev mode - run `nuxi generate` for page titles)' : ''

  // Collect all prerendered pages
  const prerendered: Array<{ pathname: string, title: string }> = []
  for (const [pathname, page] of pages) {
    prerendered.push({ pathname, title: page.title })
  }

  // Collect SSR pages from sitemap that aren't prerendered
  const other: string[] = []
  for (const url of urls) {
    const pathname = url.loc.startsWith('http') ? new URL(url.loc).pathname : url.loc
    if (!pages.has(pathname)) {
      other.push(pathname)
    }
  }

  // Output pages
  if (prerendered.length > 0 && other.length > 0) {
    parts.push(`## Prerendered Pages${devModeHint}\n`)
    for (const { pathname, title } of prerendered) {
      parts.push(title && title !== pathname ? `- [${title}](${pathname})` : `- ${pathname}`)
    }
    parts.push('')

    parts.push('## Other Pages\n')
    for (const pathname of other) {
      parts.push(`- ${pathname}`)
    }
    parts.push('')
  }
  else if (prerendered.length > 0) {
    parts.push(`## Pages${devModeHint}\n`)
    for (const { pathname, title } of prerendered) {
      parts.push(title && title !== pathname ? `- [${title}](${pathname})` : `- ${pathname}`)
    }
    parts.push('')
  }
  else if (other.length > 0) {
    parts.push(`## Pages${devModeHint}\n`)
    for (const pathname of other) {
      parts.push(`- ${pathname}`)
    }
    parts.push('')
  }

  return parts.join('\n')
}
