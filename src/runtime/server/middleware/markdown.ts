import type { ModulePublicRuntimeConfig } from '../../../module'
import { withSiteUrl } from '#site-config/server/composables/utils'
import { createError, defineEventHandler, getHeader, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { logger } from '../logger'
import { convertHtmlToMarkdown, getMarkdownRenderInfo } from '../utils'

const INTERNAL_HEADER = 'x-ai-ready-internal'

export default defineEventHandler(async (event) => {
  // Skip internal requests to prevent infinite loop
  if (getHeader(event, INTERNAL_HEADER))
    return

  const renderInfo = getMarkdownRenderInfo(event)
  if (!renderInfo)
    return

  const { path, isExplicit } = renderInfo
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig

  // Runtime: fetch HTML with internal marker to prevent recursion
  // Use manual redirect to detect and forward redirects with .md suffix
  const response = await event.fetch(path, {
    headers: { [INTERNAL_HEADER]: '1' },
    redirect: 'manual',
  }).catch((e) => {
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

  // Runtime: convert to markdown with hooks
  const result = await convertHtmlToMarkdown(
    html,
    withSiteUrl(event, path),
    config.mdreamOptions,
    { hooks: { route: path, event } },
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
