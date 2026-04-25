import type { ModulePublicRuntimeConfig } from '../../../module'
import { createError, defineEventHandler, getHeader, sendRedirect, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { withSiteUrl } from '#site-config/server/composables/utils'
import { queryPages } from '../db/queries'
import { logger } from '../logger'
import { convertHtmlToMarkdown, extractLastUpdated, getMarkdownRenderInfo, toMarkdownPath } from '../utils'
import { buildFrontmatter } from '../utils/frontmatter'
import { computeLocaleAlternates, resolveLocaleFromRoute } from '../utils/i18n'

const INTERNAL_HEADER = 'x-ai-ready-internal'

/**
 * Build a comma-joined Link header value with the standard alternates plus i18n hreflang variants.
 */
function buildLinkHeader(
  path: string,
  variant: 'html' | 'markdown',
  config: ModulePublicRuntimeConfig,
): string {
  const parts: string[] = []
  if (variant === 'html') {
    parts.push(`<${toMarkdownPath(path)}>; rel="alternate"; type="text/markdown"`)
  }
  else {
    parts.push(`<${path}>; rel="alternate"; type="text/html"`)
  }

  if (config.i18n) {
    const alternates = computeLocaleAlternates(path, config.i18n)
    for (const alt of alternates) {
      const href = variant === 'markdown' ? toMarkdownPath(alt.path) : alt.path
      parts.push(`<${href}>; rel="alternate"; hreflang="${alt.hreflang}"`)
    }
  }
  return parts.join(', ')
}

// Always signal that response content varies by Accept so caches segment correctly
function setNegotiationHeaders(event: any, path: string, config: ModulePublicRuntimeConfig) {
  setHeader(event, 'vary', 'Accept, Sec-Fetch-Dest')
  // Advertise the markdown alternate + locale variants so agents can discover them via Link header (RFC 8288)
  setHeader(event, 'link', buildLinkHeader(path, 'html', config))
}

function setMarkdownHeaders(event: any, path: string, config: ModulePublicRuntimeConfig) {
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setHeader(event, 'vary', 'Accept, Sec-Fetch-Dest')
  setHeader(event, 'link', buildLinkHeader(path, 'markdown', config))
  if (config.markdownCacheHeaders) {
    const { maxAge, swr } = config.markdownCacheHeaders
    const cacheControl = swr
      ? `public, max-age=${maxAge}, stale-while-revalidate=${maxAge}`
      : `public, max-age=${maxAge}`
    setHeader(event, 'cache-control', cacheControl)
  }
}

function notFoundMarkdown(canonicalUrl: string, path: string, config: ModulePublicRuntimeConfig): string {
  const body = [
    `# Page not found`,
    ``,
    `No content is available at \`${path}\`.`,
    ``,
    `Try one of these resources:`,
    ``,
    `- [Sitemap](/sitemap.xml)`,
    `- [llms.txt](/llms.txt)`,
    `- [llms-full.txt](/llms-full.txt)`,
    ``,
  ].join('\n')

  const i18n = config.i18n
  const locale = i18n ? resolveLocaleFromRoute(path, i18n).locale : undefined
  const alternates = i18n
    ? computeLocaleAlternates(path, i18n).map(a => ({ hreflang: a.hreflang, href: a.path }))
    : undefined

  const frontmatter = buildFrontmatter({
    title: 'Page not found',
    description: `No content is available at ${path}.`,
    canonical_url: canonicalUrl,
    last_updated: new Date().toISOString(),
    locale,
    alternates,
  })
  return `${frontmatter}\n${body}`
}

export default defineEventHandler(async (event) => {
  // Skip internal requests to prevent infinite loop
  if (getHeader(event, INTERNAL_HEADER))
    return

  const renderInfo = getMarkdownRenderInfo(event)
  if (!renderInfo)
    return

  // Accept header sent but no supported representation matched → 406
  if ('notAcceptable' in renderInfo) {
    throw createError({
      statusCode: 406,
      statusMessage: 'Not Acceptable',
      message: 'Supported types: text/html, text/markdown, text/plain',
    })
  }

  const { path, isExplicit, negotiation } = renderInfo
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const canonicalUrl = withSiteUrl(event, path)

  // Implicit HTML pass-through: set Vary + Link and let Nuxt render HTML
  if (negotiation === 'html') {
    setNegotiationHeaders(event, path, config)
    return
  }

  // Implicit markdown (Accept negotiation, not explicit .md): redirect to .md so
  // the prerendered static .md file (or .md handler) serves the response. This
  // avoids inline HTML→markdown conversion and keeps the URL space distinct so
  // CDNs cache HTML and markdown variants under separate keys — critical for
  // prerendered routes on Cloudflare Pages where HTML is served from edge cache
  // without honoring Vary: Accept.
  if (!isExplicit) {
    return sendRedirect(event, toMarkdownPath(path), 307)
  }

  // Explicit .md: fetch HTML with internal marker to prevent recursion, convert
  // via mdream. Manual redirect so we can forward redirects with .md suffix.
  logger.debug(`[markdown] Fetching HTML for ${path}`)
  const response = await event.fetch(path, {
    headers: { [INTERNAL_HEADER]: '1' },
    redirect: 'manual',
  }).catch((e) => {
    logger.error(`Failed to fetch HTML for ${path}`, e)
    return null
  })

  if (!response) {
    setMarkdownHeaders(event, path, config)
    return notFoundMarkdown(canonicalUrl, path, config)
  }

  // Forward upstream redirects, adding .md suffix to the target
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (location) {
      const redirectTarget = location.endsWith('/') ? `${location.slice(0, -1)}.md` : `${location}.md`
      setHeader(event, 'location', redirectTarget)
      return createError({
        statusCode: response.status,
        statusMessage: response.statusText,
      })
    }
  }

  // Agents discard 404 bodies; return 200 with helpful markdown instead
  if (!response.ok) {
    setMarkdownHeaders(event, path, config)
    return notFoundMarkdown(canonicalUrl, path, config)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    setMarkdownHeaders(event, path, config)
    return notFoundMarkdown(canonicalUrl, path, config)
  }

  const html = await response.text()
  logger.debug(`[markdown] Fetched HTML for ${path} (${html.length} bytes)`)

  // Resolve last_updated: DB (authoritative, set at index time) → page meta tags
  // → request time. The DB lookup keeps the timestamp stable across requests.
  const dbPage = await queryPages(event, { route: path }).catch(() => undefined) as { updatedAt?: string } | undefined
  const lastUpdated = dbPage?.updatedAt || extractLastUpdated(html) || new Date().toISOString()

  // Convert via mdream; pass canonical_url + last_updated through additionalFields
  // so they land at the root of mdream's emitted YAML frontmatter, where
  // Vercel's agent-readability audit looks for them.
  // Locale is a simple scalar; alternates are surfaced via the Link header
  // (RFC 8288) since mdream's frontmatter only accepts string scalars.
  const additionalFrontmatter: Record<string, string> = {
    canonical_url: canonicalUrl,
    last_updated: lastUpdated,
  }

  if (config.i18n) {
    additionalFrontmatter.locale = resolveLocaleFromRoute(path, config.i18n).locale
  }

  const result = await convertHtmlToMarkdown(
    html,
    canonicalUrl,
    config.mdreamOptions,
    {
      hooks: { route: path, event },
      additionalFrontmatter,
    },
  )

  setMarkdownHeaders(event, path, config)
  return result.markdown
})
