import type { ModulePublicRuntimeConfig } from '../../../module'
import { createError, defineEventHandler, getHeader, sendRedirect, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { withSiteUrl } from '#site-config/server/composables/utils'
import { queryPages } from '../db/queries'
import { logger } from '../logger'
import { convertHtmlToMarkdown, extractLastUpdated, getMarkdownRenderInfo, toMarkdownPath } from '../utils'
import { tryGetContentMarkdown } from '../utils/content'
import { buildFrontmatter } from '../utils/frontmatter'

const INTERNAL_HEADER = 'x-ai-ready-internal'

// Always signal that response content varies by Accept so caches segment correctly
function setNegotiationHeaders(event: any, path: string) {
  setHeader(event, 'vary', 'Accept, Sec-Fetch-Dest')
  // Advertise the markdown alternate so agents can discover it via Link header (RFC 8288)
  setHeader(event, 'link', `<${toMarkdownPath(path)}>; rel="alternate"; type="text/markdown"`)
}

function setMarkdownHeaders(event: any, path: string, config: ModulePublicRuntimeConfig) {
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setHeader(event, 'vary', 'Accept, Sec-Fetch-Dest')
  setHeader(event, 'link', `<${path}>; rel="alternate"; type="text/html"`)
  if (config.markdownCacheHeaders) {
    const { maxAge, swr } = config.markdownCacheHeaders
    const cacheControl = swr
      ? `public, max-age=${maxAge}, stale-while-revalidate=${maxAge}`
      : `public, max-age=${maxAge}`
    setHeader(event, 'cache-control', cacheControl)
  }
}

function notFoundMarkdown(canonicalUrl: string, path: string): string {
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
  const frontmatter = buildFrontmatter({
    title: 'Page not found',
    description: `No content is available at ${path}.`,
    canonical_url: canonicalUrl,
    last_updated: new Date().toISOString(),
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
    setNegotiationHeaders(event, path)
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

  // Prefer @nuxt/content source over HTML→mdream conversion. Content stores
  // pages as a structural AST (minimark) that round-trips to markdown without
  // the lossiness of HTML parsing. Frontmatter is layered: our canonical_url +
  // last_updated land at the top so Vercel's agent-readability audit picks
  // them up, mirroring the HTML conversion path's behaviour.
  const contentPage = await tryGetContentMarkdown(event, path).catch((e) => {
    logger.debug(`[markdown] Content lookup failed for ${path}`, e)
    return null
  })
  if (contentPage) {
    logger.debug(`[markdown] Serving content source for ${path} (${contentPage.markdown.length} bytes)`)
    const frontmatter = buildFrontmatter({
      title: contentPage.title,
      description: contentPage.description,
      canonical_url: canonicalUrl,
      last_updated: contentPage.updatedAt || new Date().toISOString(),
    })
    setMarkdownHeaders(event, path, config)
    return `${frontmatter}\n${contentPage.markdown}`
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
    return notFoundMarkdown(canonicalUrl, path)
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
    return notFoundMarkdown(canonicalUrl, path)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    setMarkdownHeaders(event, path, config)
    return notFoundMarkdown(canonicalUrl, path)
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
  const result = await convertHtmlToMarkdown(
    html,
    canonicalUrl,
    config.mdreamOptions,
    {
      hooks: { route: path, event },
      additionalFrontmatter: {
        canonical_url: canonicalUrl,
        last_updated: lastUpdated,
      },
    },
  )

  setMarkdownHeaders(event, path, config)
  return result.markdown
})
