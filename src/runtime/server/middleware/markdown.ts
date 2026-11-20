import { createError, defineEventHandler } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { applyNegotiation, decideNegotiation } from '../utils/negotiation-response'
import { isSitemapMdRequest } from '../utils/sitemap-md'

export default defineEventHandler(async (event) => {
  if (event.path.split('?')[0]?.endsWith('/sitemap.md')) {
    const runtimeConfig = useRuntimeConfig(event)
    if (isSitemapMdRequest(event.path, runtimeConfig.app.baseURL, (runtimeConfig['nuxt-ai-ready'] as any)?.sitemapMd !== false))
      return
  }

  const decision = decideNegotiation(event, 'middleware')
  if (decision._tag === 'missing-markdown')
    throw createError({ statusCode: 404, statusMessage: 'Markdown page not found' })

  const negotiationResponse = await applyNegotiation(event, decision)
  if (decision._tag !== 'render')
    return negotiationResponse

  // Keep the converter and its dependencies off the HTML request path.
  const { renderMarkdown } = await import('#ai-ready-virtual/render-markdown.mjs')
  return renderMarkdown?.(event, decision.path)
})
