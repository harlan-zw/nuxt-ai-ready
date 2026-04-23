import type { ModulePublicRuntimeConfig } from '../../../module'
import { createError, defineEventHandler, getHeader, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { withSiteUrl } from '#site-config/server/composables/utils'
import { logger } from '../logger'
import { convertHtmlToMarkdown, getMarkdownRenderInfo } from '../utils'
import { buildFrontmatter, withFrontmatter } from '../utils/frontmatter'

const INTERNAL_HEADER = 'x-ai-ready-internal'

// Always signal that response content varies by Accept so caches segment correctly
function setNegotiationHeaders(event: any, path: string) {
  setHeader(event, 'vary', 'Accept, Sec-Fetch-Dest')
  // Advertise the markdown alternate so agents can discover it via Link header (RFC 8288)
  const mdPath = path === '/' ? '/index.md' : `${path}.md`
  setHeader(event, 'link', `<${mdPath}>; rel="alternate"; type="text/markdown"`)
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

  // Runtime: fetch HTML with internal marker to prevent recursion
  // Use manual redirect to detect and forward redirects with .md suffix
  logger.debug(`[markdown] Fetching HTML for ${path}`)
  const response = await event.fetch(path, {
    headers: { [INTERNAL_HEADER]: '1' },
    redirect: 'manual',
  }).catch((e) => {
    logger.error(`Failed to fetch HTML for ${path}`, e)
    return null
  })

  if (!response) {
    if (isExplicit) {
      setMarkdownHeaders(event, path, config)
      return notFoundMarkdown(canonicalUrl, path)
    }
    return
  }

  // Handle redirects - forward to .md version of redirect target
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (location) {
      // Add .md suffix to redirect target
      const redirectTarget = location.endsWith('/') ? `${location.slice(0, -1)}.md` : `${location}.md`
      setHeader(event, 'location', redirectTarget)
      return createError({
        statusCode: response.status,
        statusMessage: response.statusText,
      })
    }
  }

  if (!response.ok) {
    // Agents discard 404 bodies; return 200 with helpful markdown so agents get useful info
    if (isExplicit) {
      setMarkdownHeaders(event, path, config)
      return notFoundMarkdown(canonicalUrl, path)
    }
    return
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    if (isExplicit) {
      setMarkdownHeaders(event, path, config)
      return notFoundMarkdown(canonicalUrl, path)
    }
    return
  }

  const html = await response.text()
  logger.debug(`[markdown] Fetched HTML for ${path} (${html.length} bytes)`)

  // Runtime: convert to markdown with hooks
  const result = await convertHtmlToMarkdown(
    html,
    canonicalUrl,
    config.mdreamOptions,
    { hooks: { route: path, event }, extractUpdatedAt: true },
  )

  setMarkdownHeaders(event, path, config)

  return withFrontmatter(result.markdown, {
    title: result.title,
    description: result.description,
    canonical_url: canonicalUrl,
    last_updated: result.updatedAt || new Date().toISOString(),
  })
})
