import { toMarkdownPath } from '../../markdown-path'
import { toDeployedRoute } from '../../route-path'

export const SITEMAP_MD_ROUTE = '/sitemap.md'

export interface SitemapMdEntry {
  route: string
  title?: string
  updatedAt?: string
}

export interface SitemapMdOptions {
  siteName?: string
  resolveHref?: (route: string) => string
}

function topSegment(route: string): string {
  return route.split('/').filter(Boolean)[0] || ''
}

function escapeTitle(title: string): string {
  return title.replaceAll('[', '\\[').replaceAll(']', '\\]')
}

function formatEntry(entry: SitemapMdEntry, resolveHref: (route: string) => string): string {
  const title = escapeTitle(entry.title?.trim() || entry.route)
  const href = resolveHref(entry.route)
  if (entry.updatedAt) {
    const parsed = new Date(entry.updatedAt)
    if (!Number.isNaN(parsed.getTime()))
      return `- [${title}](${href} "${parsed.toISOString()}")`
  }
  return `- [${title}](${href})`
}

export function buildSitemapMd(entries: SitemapMdEntry[], options: SitemapMdOptions = {}): string {
  const resolveHref = options.resolveHref || toMarkdownPath
  const groups = new Map<string, SitemapMdEntry[]>()
  for (const entry of [...entries].sort((a, b) => a.route.localeCompare(b.route))) {
    const key = topSegment(entry.route)
    const group = groups.get(key)
    if (group)
      group.push(entry)
    else
      groups.set(key, [entry])
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === '')
      return -1
    if (b === '')
      return 1
    return a.localeCompare(b)
  })

  const parts = [`# ${options.siteName || 'Site'} Sitemap`, '', 'All pages in Markdown format.']
  for (const key of keys) {
    parts.push('', `## ${key || 'Root'}`)
    for (const entry of groups.get(key)!)
      parts.push(formatEntry(entry, resolveHref))
  }
  return `${parts.join('\n')}\n`
}

export function appendSitemapSection(markdown: string, sitemapHref = SITEMAP_MD_ROUTE): string {
  const section = `## Sitemap\n\nSee the full [sitemap](${sitemapHref}) for all pages.`
  const trimmed = markdown.trimEnd()
  if (trimmed.endsWith(section))
    return `${trimmed}\n`
  return `${trimmed}\n\n${section}\n`
}

export function isSitemapMdRequest(path: string, baseURL: string, enabled: boolean): boolean {
  if (!enabled)
    return false
  const withoutQuery = path.split('?')[0] || path
  return withoutQuery === SITEMAP_MD_ROUTE
    || withoutQuery === toDeployedRoute(SITEMAP_MD_ROUTE, baseURL)
}
