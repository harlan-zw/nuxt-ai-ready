import { createError, defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { withSiteUrl } from '#site-config/server/composables/utils'
import { logger } from '../logger'
import { convertHtmlToMarkdown, extractLastUpdated, getMarkdownRenderInfo } from '../utils'
import { tryGetContentMarkdown } from '../utils/content'
import { buildFrontmatter } from '../utils/frontmatter'
import { extractKeywords } from '../utils/keywords'

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

  logger.debug(`[markdown.prerender] Fetching HTML for ${path}`)
  const response = await event.fetch(path)
  if (!response.ok) {
    return createError({
      statusCode: response.status,
      statusMessage: response.statusText,
      message: `Failed to fetch HTML for ${path}`,
    })
  }

  const html = await response.text()
  logger.debug(`[markdown.prerender] Fetched HTML for ${path} (${html.length} bytes)`)

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
