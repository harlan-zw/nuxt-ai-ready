import { createError, defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { withSiteUrl } from '#site-config/server/composables/utils'
import { logger } from '../logger'
import { convertHtmlToMarkdown, extractLastUpdated, getMarkdownRenderInfo } from '../utils'
import { tryGetContentMarkdown } from '../utils/content'
import { buildFrontmatter } from '../utils/frontmatter'
import { extractKeywords } from '../utils/keywords'
import { readPrerenderedHtml } from '../utils/prerendered-html'

// Pull headings out of source markdown for the page-data record. mdream
// produces a similar list during HTML conversion; this mirrors that shape so
// downstream consumers (search, MCP) don't need to special-case content
// pages. Regex is constructed locally so concurrent prerender requests don't
// share `lastIndex` state.
function extractHeadingsFromMarkdown(markdown: string): Array<Record<string, string>> {
  const headings: Array<Record<string, string>> = []
  for (const m of markdown.matchAll(/^(#{1,6}) ([^\n]+)$/gm)) {
    const hashes = m[1]
    const text = m[2]?.trim()
    if (!hashes || !text)
      continue
    headings.push({ [`h${hashes.length}`]: text })
  }
  return headings
}

export default defineEventHandler(async (event) => {
  // Only run during prerender
  if (!import.meta.prerender) {
    return
  }

  const renderInfo = getMarkdownRenderInfo(event, true)
  if (!renderInfo || 'notAcceptable' in renderInfo)
    return

  const { path } = renderInfo
  const runtimeConfig = useRuntimeConfig(event)['nuxt-ai-ready'] as any
  const canonicalUrl = withSiteUrl(event, path)

  // Prefer @nuxt/content source: skip HTML fetch + mdream when the route is
  // backed by a content collection. Body comes from the AST, so headings and
  // keywords come from the markdown itself rather than the rendered HTML.
  const contentPage = await tryGetContentMarkdown(event, path).catch(() => null)
  if (contentPage) {
    logger.debug(`[markdown.prerender] Using content source for ${path} (${contentPage.markdown.length} bytes)`)
    const lastUpdated = contentPage.updatedAt || new Date().toISOString()
    const frontmatter = buildFrontmatter({
      title: contentPage.title,
      description: contentPage.description,
      canonical_url: canonicalUrl,
      last_updated: lastUpdated,
    })
    const markdown = `${frontmatter}\n${contentPage.markdown}`
    const headings = extractHeadingsFromMarkdown(contentPage.markdown)
    const keywords = extractKeywords(contentPage.markdown, '')
    return JSON.stringify({
      markdown,
      title: contentPage.title || '',
      description: contentPage.description || '',
      headings,
      keywords,
      updatedAt: lastUpdated,
    })
  }

  // The .md route is queued via prerenderRoutes() while the page's HTML render
  // is in flight, so by the time this handler runs the page has already been
  // rendered and written to the static output dir. Reuse that file instead of
  // triggering a full second SSR render via event.fetch — this halves the
  // prerender render load on large sites and avoids re-writing Nuxt's internal
  // prerender payload cache for the page (see nuxt/nuxt#35590). Falls back to
  // event.fetch when the file isn't there (e.g. non-static file mapping).
  let html = await readPrerenderedHtml(runtimeConfig.prerenderOutputDir, path)
  if (html) {
    logger.debug(`[markdown.prerender] Reusing prerendered HTML for ${path} (${html.length} bytes)`)
  }
  else {
    logger.debug(`[markdown.prerender] Fetching HTML for ${path}`)
    const response = await event.fetch(path, { signal: AbortSignal.timeout(30000) }).catch((err) => {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw createError({
          statusCode: 504,
          statusMessage: 'Gateway Timeout',
          message: `Timed out fetching HTML for ${path}`,
        })
      }
      throw err
    })
    if (!response.ok) {
      return createError({
        statusCode: response.status,
        statusMessage: response.statusText,
        message: `Failed to fetch HTML for ${path}`,
      })
    }

    html = await response.text()
    logger.debug(`[markdown.prerender] Fetched HTML for ${path} (${html.length} bytes)`)
  }

  // Skip error pages that returned 200 (e.g., Vue Router "no match" pages)
  if (html.includes('__NUXT_ERROR__') || html.includes('nuxt-error-page')) {
    return createError({
      statusCode: 404,
      message: `Page rendered as error: ${path}`,
    })
  }
  const lastUpdated = extractLastUpdated(html) || new Date().toISOString()
  const result = await convertHtmlToMarkdown(
    html,
    canonicalUrl,
    runtimeConfig.mdreamOptions,
    {
      extractUpdatedAt: true,
      additionalFrontmatter: {
        canonical_url: canonicalUrl,
        last_updated: lastUpdated,
      },
    },
  )

  // Extract keywords from content
  const keywords = extractKeywords(result.textContent, result.metaKeywords)

  return JSON.stringify({
    markdown: result.markdown,
    title: result.title,
    description: result.description,
    headings: result.headings,
    keywords,
    ...(result.updatedAt && { updatedAt: result.updatedAt }),
  })
})
