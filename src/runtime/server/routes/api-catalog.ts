import { createError, defineEventHandler, setResponseStatus, useRuntimeConfig } from 'nuxt/server'

interface ApiCatalogRuntimeConfig {
  href: string
  mediaType: string
  document: {
    linkset: Array<Record<string, unknown>>
  }
}
export default defineEventHandler((event) => {
  event.res.headers.set('Access-Control-Allow-Origin', '*')
  if (event.req.method === 'OPTIONS') {
    Object.entries({
      'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
      'Access-Control-Allow-Methods': 'GET, HEAD',
    }).forEach(([name, value]) => event.res.headers.set(name, value))
    setResponseStatus(event, 204)
    return null
  }
  if (!['GET', 'HEAD'].includes(event.req.method))
    throw createError({ status: 405, statusText: 'Method Not Allowed' })
  const runtimeConfig = useRuntimeConfig()['nuxt-ai-ready'] as unknown as {
    apiCatalog?: ApiCatalogRuntimeConfig
    aiTerms?: { href: string }
  }
  const config = runtimeConfig.apiCatalog
  if (!config)
    throw createError({ status: 404, message: 'API catalog is not configured' })
  event.res.headers.set('content-type', config.mediaType)
  event.res.headers.set('link', [
    `<${config.href}>; rel="api-catalog"`,
    runtimeConfig.aiTerms && `<${runtimeConfig.aiTerms.href}>; rel="ai-terms"`,
  ].filter(Boolean).join(', '))
  if (event.req.method === 'HEAD')
    return
  return config.document
})
