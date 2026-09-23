import type { MarkdownSourceContext } from '../../types'
import type { NegotiationContext } from '../utils/negotiation-response'
import { createError, defineEventHandler, getRequestURL, setHeader, setResponseStatus } from '#nuxtseo/h3'
import { useNitroApp, useRuntimeConfig } from '#nuxtseo/nitro'
import { resolveLocaleAlternateUrl } from '../../i18n-url'
import { logger } from '../logger'
import { computeLocaleAlternates, resolveLocaleFromRoute } from '../utils/i18n'
import { resolveMarkdownRedirect } from '../utils/markdown-redirect'
import { INTERNAL_HEADER } from '../utils/negotiation-decision'
import { applyNegotiation, buildNegotiationContext, decideNegotiation, ensureSiteConfig, setMarkdownHeaders } from '../utils/negotiation-response'
import { appendSitemapSection, isSitemapMdRequest, SITEMAP_MD_ROUTE } from '../utils/sitemap-md'

function notFoundMarkdown(
  ctx: NegotiationContext,
  canonicalUrl: string,
  build: typeof import('../utils/frontmatter').buildFrontmatter,
): string {
  const { path, config, resolveUrl, routeContext } = ctx
  const body = [
    `# Page not found`,
    ``,
    `No content is available at \`${path}\`.`,
    ``,
    `Try one of these resources:`,
    ``,
    `- [Sitemap](${resolveUrl('/sitemap.xml')})`,
    `- [llms.txt](${resolveUrl('/llms.txt')})`,
    `- [llms-full.txt](${resolveUrl('/llms-full.txt')})`,
    ``,
  ].join('\n')

  const i18n = config.i18n
  const locale = i18n ? resolveLocaleFromRoute(path, i18n, routeContext).locale : undefined
  const alternates = i18n
    ? computeLocaleAlternates(path, i18n, routeContext).map(a => ({
        hreflang: a.hreflang,
        href: resolveLocaleAlternateUrl(a, resolveUrl),
      }))
    : undefined

  const frontmatter = build({
    title: 'Page not found',
    description: `No content is available at ${path}.`,
    canonical_url: canonicalUrl,
    locale,
    alternates,
  })
  return `${frontmatter}\n${body}`
}

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)
  if (isSitemapMdRequest(event.path, runtimeConfig.app.baseURL, (runtimeConfig['nuxt-ai-ready'] as any)?.sitemapMd !== false))
    return

  const decision = decideNegotiation(event, 'middleware')
  const negotiationResponse = await applyNegotiation(event, decision)
  if (decision._tag !== 'render')
    return negotiationResponse

  await ensureSiteConfig(event)
  const ctx = buildNegotiationContext(event, decision.path)
  const { path, config, resolvePath, resolveUrl, routeContext } = ctx
  const canonicalUrl = resolveUrl(path)
  const finalizeMarkdown = (markdown: string) => config.sitemapMd === false
    ? markdown
    : appendSitemapSection(markdown, resolvePath(SITEMAP_MD_ROUTE))

  const [
    { tryGetContentMarkdown },
    { fetchRawWithEvent },
    { buildFrontmatter, layerFrontmatter },
  ] = await Promise.all([
    import('../utils/content'),
    import('../utils/fetch'),
    import('../utils/frontmatter'),
  ])

  // A site that already holds the markdown a page was rendered from can serve
  // it verbatim. That is better than converting the rendering back, and it
  // skips the internal subrequest that fetches the HTML.
  const sourceContext: MarkdownSourceContext = { route: path, event, source: null }
  await useNitroApp().hooks.callHook('ai-ready:markdown:source', sourceContext)
  if (sourceContext.source) {
    const { markdown, title, description, updatedAt } = sourceContext.source
    const responseMarkdown = layerFrontmatter({
      title: title ?? path,
      description,
      canonical_url: canonicalUrl,
      last_updated: updatedAt,
    }, markdown)
    setMarkdownHeaders(event, ctx)
    return finalizeMarkdown(responseMarkdown)
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
      last_updated: contentPage.updatedAt,
    })
    setMarkdownHeaders(event, ctx)
    return finalizeMarkdown(`${frontmatter}\n${contentPage.markdown}`)
  }

  // Explicit .md: fetch HTML with internal marker to prevent recursion, convert
  // via mdream. Manual redirect so an upstream redirect can point the client
  // at the markdown sibling of its target.
  const origin = getRequestURL(event).origin
  const siteUrl = resolveUrl('/')
  const redirectOptions = {
    pageUrl: `${origin}${resolvePath(path)}`,
    origins: URL.canParse(siteUrl) ? [new URL(siteUrl).origin] : [],
  }
  let htmlPath = resolvePath(path)
  let response: Response | null = null
  // Two fetches at most: a redirect back onto this same markdown document, such
  // as a trailing-slash redirect, is followed once instead of looping.
  for (let attempt = 0; attempt < 2; attempt++) {
    logger.debug(`[markdown] Fetching HTML for ${htmlPath}`)
    response = await fetchRawWithEvent(event, htmlPath, {
      headers: { [INTERNAL_HEADER]: '1' },
      redirect: 'manual',
    }).catch((e) => {
      logger.error(`Failed to fetch HTML for ${htmlPath}`, e)
      return null
    })

    const location = response && response.status >= 300 && response.status < 400
      ? response.headers.get('location')
      : null
    if (!response || !location)
      break

    const redirect = resolveMarkdownRedirect(location, redirectOptions)
    if (redirect._tag === 'follow' && attempt === 0) {
      htmlPath = redirect.path
      continue
    }
    setHeader(event, 'location', redirect._tag === 'redirect' ? redirect.location : location)
    return createError({
      statusCode: response.status,
      statusMessage: response.statusText,
    })
  }

  if (!response) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
    })
  }

  // Keep application errors intact, including their body and headers. Only a
  // missing page gets the Markdown guidance response.
  if (!response.ok && response.status !== 404)
    return response

  if (response.status === 404) {
    setMarkdownHeaders(event, ctx)
    setResponseStatus(event, 404)
    return notFoundMarkdown(ctx, canonicalUrl, buildFrontmatter)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    setMarkdownHeaders(event, ctx)
    setResponseStatus(event, 404)
    return notFoundMarkdown(ctx, canonicalUrl, buildFrontmatter)
  }

  const html = await response.text()
  logger.debug(`[markdown] Fetched HTML for ${path} (${html.length} bytes)`)

  const [
    { queryPages },
    { convertHtmlToMarkdown, extractLastUpdated },
  ] = await Promise.all([
    import('../db/queries'),
    import('../utils'),
  ])

  // Resolve last_updated: DB (authoritative, set at index time) → page meta tags.
  // No source means no field: the request time would claim the page just changed.
  const dbPage = await queryPages(event, { route: path }).catch((err) => {
    logger.debug(`[markdown] DB lookup failed for ${path}:`, err)
    return undefined
  }) as { updatedAt?: string } | undefined
  const lastUpdated = dbPage?.updatedAt || extractLastUpdated(html)

  // Convert via mdream; pass canonical_url + last_updated through additionalFields
  // so they land at the root of mdream's emitted YAML frontmatter, where
  // Vercel's agent-readability audit looks for them.
  // Locale is a simple scalar; alternates are surfaced via the Link header
  // (RFC 8288) since mdream's frontmatter only accepts string scalars.
  const additionalFrontmatter: Record<string, string> = {
    canonical_url: canonicalUrl,
  }
  if (lastUpdated)
    additionalFrontmatter.last_updated = lastUpdated

  if (config.i18n) {
    additionalFrontmatter.locale = resolveLocaleFromRoute(path, config.i18n, routeContext).locale
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

  setMarkdownHeaders(event, ctx)
  return finalizeMarkdown(result.markdown)
})
