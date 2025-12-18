import type { ModulePublicRuntimeConfig } from '../../../module'
import { withSiteUrl } from '#site-config/server/composables/utils'
import { createError, defineEventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { logger } from '../logger'
import { convertHtmlToMarkdown, getMarkdownRenderInfo } from '../utils'

export default defineEventHandler(async (event) => {
  const renderInfo = getMarkdownRenderInfo(event)
  if (!renderInfo)
    return

  const { path, isExplicit } = renderInfo
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig

  // Runtime: fetch HTML
  const response = await event.fetch(path).catch((e) => {
    logger.error(`Failed to fetch HTML for ${path}`, e)
    return null
  })

  if (!response) {
    if (isExplicit) {
      return createError({
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        message: `Failed to fetch HTML for ${path}`,
      })
    }
    return
  }

  if (!response.ok) {
    if (isExplicit) {
      return createError({
        statusCode: response.status,
        statusMessage: response.statusText,
        message: `Failed to fetch HTML for ${path}`,
      })
    }
    return
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    if (isExplicit) {
      return createError({
        statusCode: 415,
        statusMessage: 'Unsupported Media Type',
        message: `Expected text/html but got ${contentType} for ${path}`,
      })
    }
    return
  }

  const html = await response.text()

  // Runtime: convert to markdown
  const result = await convertHtmlToMarkdown(
    html,
    withSiteUrl(event, path),
    config,
    path,
    event,
  )
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')

  // Set cache headers
  if (config.markdownCacheHeaders) {
    const { maxAge, swr } = config.markdownCacheHeaders
    const cacheControl = swr
      ? `public, max-age=${maxAge}, stale-while-revalidate=${maxAge}`
      : `public, max-age=${maxAge}`
    setHeader(event, 'cache-control', cacheControl)
  }

  // Return markdown
  return result.markdown
})
