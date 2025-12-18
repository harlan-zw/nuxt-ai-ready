import { withSiteUrl } from '#site-config/server/composables/utils'
import { createError, defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { convertHtmlToMarkdownMeta, getMarkdownRenderInfo } from '../utils'

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

  const response = await event.fetch(path)
  if (!response.ok) {
    return createError({
      statusCode: response.status,
      statusMessage: response.statusText,
      message: `Failed to fetch HTML for ${path}`,
    })
  }

  const html = await response.text()

  // Skip error pages that returned 200 (e.g., Vue Router "no match" pages)
  if (html.includes('__NUXT_ERROR__') || html.includes('nuxt-error-page')) {
    return createError({
      statusCode: 404,
      message: `Page rendered as error: ${path}`,
    })
  }
  const result = convertHtmlToMarkdownMeta(
    html,
    withSiteUrl(event, path),
    runtimeConfig.mdreamOptions,
  )

  return JSON.stringify(result)
})
