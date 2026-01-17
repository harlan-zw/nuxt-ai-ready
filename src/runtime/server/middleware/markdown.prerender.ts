import { withSiteUrl } from '#site-config/server/composables/utils'
import { createError, defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { logger } from '../logger'
import { convertHtmlToMarkdown, getMarkdownRenderInfo } from '../utils'
import { extractKeywords } from '../utils/keywords'

export default defineEventHandler(async (event) => {
  // Only run during prerender
  if (!import.meta.prerender) {
    return
  }

  const renderInfo = getMarkdownRenderInfo(event, true)
  if (!renderInfo)
    return

  const { path } = renderInfo
  const runtimeConfig = useRuntimeConfig(event)['nuxt-ai-ready'] as any

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
  const result = await convertHtmlToMarkdown(
    html,
    withSiteUrl(event, path),
    runtimeConfig.mdreamOptions,
    { extractUpdatedAt: true },
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
