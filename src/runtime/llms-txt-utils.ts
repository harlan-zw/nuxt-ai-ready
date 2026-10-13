import type { H3Event } from '#nuxtseo/h3'
import type { LlmsTxtPage } from './llms-txt-files'
import type { PageMetadata } from './server/db/queries'
import type { RuntimeI18nConfig } from './server/utils/i18n'
import type { LlmsTxtConfig } from './types'
import { decodePath } from 'ufo'
import { createError, getRequestHost, getRequestURL } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { getSiteConfig } from '#site-config/server/composables/getSiteConfig'
import { withSiteTrailingSlash, withSiteUrl } from '#site-config/server/composables/utils'
import { createLlmsTxtFiles } from './llms-txt-files'
import { hasMarkdownTwin, toMarkdownPath } from './markdown-path'
import { normalizePersistedRoute, toDeployedRoute, toLogicalRoute } from './route-path'
import { queryPageMetadata, queryPages } from './server/db/queries'
import { logger } from './server/logger'
import { fetchSitemapUrlGroups, getSitemapsFromConfig } from './server/utils/sitemap'

export { normalizeLlmsTxtConfig } from './llms-txt-format'

async function findMarkdownLinkAvailability() {
  if (!import.meta.prerender)
    return { runtimeMarkdownAvailable: true, paths: new Set<string>() }
  const { readMarkdownLinkAvailabilityFromFilesystem } = await import('#ai-ready-virtual/read-page-data.mjs')
  const availability = await readMarkdownLinkAvailabilityFromFilesystem()
  return {
    runtimeMarkdownAvailable: availability.runtimeMarkdownAvailable,
    paths: new Set(availability.paths.map(decodePath)),
  }
}

/** One discovery snapshot supplies the root and every bounded child file. */
export async function buildLlmsTxtFiles(event: H3Event): Promise<Record<string, string>> {
  const runtimeConfig = useRuntimeConfig(event)
  const aiReadyConfig = runtimeConfig['nuxt-ai-ready'] as any
  const siteConfig = getSiteConfig(event)
  const config = aiReadyConfig.llmsTxt as LlmsTxtConfig
  const baseURL = runtimeConfig.app.baseURL
  const resolveUrl = (path: string) => withSiteUrl(event, toDeployedRoute(path, baseURL), { withBase: true })
  const resolvePageUrl = (path: string) => resolveUrl(withSiteTrailingSlash(event, path))
  const canonicalSiteUrl = siteConfig.url ? resolveUrl('/') : undefined
  const i18n = aiReadyConfig.i18n as RuntimeI18nConfig | null | undefined
  const i18nRuntime = i18n
    ? { _tag: 'enabled' as const, config: i18n, ...await import('./llms-txt-i18n') }
    : { _tag: 'disabled' as const }
  const i18nContext = { host: getRequestHost(event, { xForwardedHost: true }) }
  const parts = [`# ${(siteConfig.name || canonicalSiteUrl || 'Site').replace(/\s+/g, ' ').trim()}`]
  if (siteConfig.description)
    parts.push('', `> ${siteConfig.description.replace(/\s+/g, ' ').trim()}`)
  if (canonicalSiteUrl)
    parts.push('', `Canonical Origin: ${canonicalSiteUrl}`)

  const sections = config.sections?.map(section => ({ ...section, links: section.links ? [...section.links] : undefined })) ?? []
  const resources = sections.find(section => section.title === 'LLM Resources' && !section.sitemap)
  if (resources) {
    resources.links ||= []
    for (const sitemap of getSitemapsFromConfig(event).filter(sitemap => config.sitemaps === undefined || config.sitemaps.includes(sitemap.name))) {
      resources.links.push({ title: sitemap.route.split('/').pop() || `${sitemap.name}.xml`, href: resolveUrl(toLogicalRoute(sitemap.route, baseURL)), description: 'XML sitemap for search engines and crawlers.' })
    }
    if (!getSitemapsFromConfig(event).length && (config.sitemaps === undefined || config.sitemaps.includes('sitemap')))
      resources.links.push({ title: 'sitemap.xml', href: resolveUrl('/sitemap.xml'), description: 'XML sitemap for search engines and crawlers.' })
    resources.links.push({ title: 'robots.txt', href: resolveUrl('/robots.txt'), description: 'Crawler rules and permissions.' })
  }

  if (config.pages === false && !sections.some(section => section.sitemap))
    return Object.fromEntries(createLlmsTxtFiles({ header: parts.join('\n'), config, sections, pages: [], sitemapPages: new Map(), resolveUrl }))

  // Database rows supply metadata. The selected sitemap supplies admission.
  const groups = await fetchSitemapUrlGroups(event, config.sitemaps)
  const allowedOrigin = canonicalSiteUrl ? new URL(canonicalSiteUrl).origin : undefined
  const requestOrigin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  const sitemapPaths = new Map<string, Set<string>>()
  for (const [name, urls] of groups) {
    const paths = new Set<string>()
    for (const entry of urls) {
      const url = URL.canParse(entry.loc, canonicalSiteUrl || 'http://localhost') ? new URL(entry.loc, canonicalSiteUrl || 'http://localhost') : undefined
      if (!url || url.search || url.hash || (allowedOrigin && url.origin !== allowedOrigin && url.origin !== requestOrigin))
        continue
      const path = toLogicalRoute(url.pathname, baseURL)
      paths.add(path)
    }
    sitemapPaths.set(name, paths)
  }
  const admitted = new Set([...sitemapPaths.values()].flatMap(paths => [...paths]))
  let stored: PageMetadata[] = []
  if (aiReadyConfig.database?._tag !== 'Disabled') {
    const read = config.pages === 'all'
      ? Promise.all([queryPages(event), queryPages(event, { where: { hasError: true } })]).then(results => results.flat())
      // Include legacy deployed routes without scanning every retired database row.
      : queryPageMetadata(event, [...admitted].flatMap(path => [path, toDeployedRoute(path, baseURL)]))
    stored = await read.catch((error) => {
      logger.warn(`[ai-ready] Database unavailable for llms.txt. Using sitemap metadata: ${error instanceof Error ? error.message : String(error)}`)
      return []
    })
  }
  const errorPaths = new Set(stored.filter(page => page.isError).map(page => normalizePersistedRoute(page.route, admitted, baseURL)))
  const metadata = new Map(stored.map(page => [normalizePersistedRoute(page.route, admitted, baseURL), page]))
  const availability = config.markdownLinks ? await findMarkdownLinkAvailability() : undefined
  const href = (path: string) => {
    const markdownPath = toMarkdownPath(path)
    if (availability && (availability.paths.has(decodePath(toDeployedRoute(markdownPath, baseURL))) || (availability.runtimeMarkdownAvailable && hasMarkdownTwin(path))))
      return resolveUrl(markdownPath)
    return resolvePageUrl(path)
  }
  const pageMap = new Map<string, LlmsTxtPage>()
  const candidates = config.pages === 'all' ? new Set([...admitted, ...metadata.keys()]) : admitted
  for (const pathname of [...candidates].sort()) {
    if (errorPaths.has(pathname))
      continue
    const page = metadata.get(pathname)
    const locale = page?.locale || (i18nRuntime._tag === 'enabled' ? i18nRuntime.resolveLocaleFromRoute(pathname, i18nRuntime.config, i18nContext).locale : undefined)
    pageMap.set(pathname, { pathname, href: href(pathname), title: page?.title, description: page?.description, locale })
  }
  let rootContent: string | undefined
  if (i18nRuntime._tag === 'enabled') {
    const counts = new Map<string, number>()
    for (const page of pageMap.values())
      counts.set(page.locale!, (counts.get(page.locale!) || 0) + 1)
    rootContent = i18nRuntime.formatAvailableLanguagesSection(i18nRuntime.config, counts, href, i18nContext).join('\n')
    for (const [path, page] of pageMap) {
      if (page.locale !== i18nRuntime.config.defaultLocale)
        pageMap.delete(path)
    }
  }
  const sitemapPages = new Map([...sitemapPaths].map(([name, paths]) => [name, [...paths].flatMap(path => pageMap.has(path) ? [pageMap.get(path)!] : [])]))
  return Object.fromEntries(createLlmsTxtFiles({ header: parts.join('\n'), config, sections, rootContent, pages: config.pages === false ? [] : [...pageMap.values()], sitemapPages, resolveUrl }))
}

export async function buildLlmsTxt(event: H3Event): Promise<string> {
  const files = await buildLlmsTxtFiles(event)
  const path = toLogicalRoute(event.path.split('?')[0]!, useRuntimeConfig(event).app.baseURL)
  const content = files[path]
  if (content === undefined)
    throw createError({ statusCode: 404, statusMessage: 'llms.txt file not found' })
  return content
}
