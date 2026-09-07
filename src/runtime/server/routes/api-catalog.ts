import { assertMethod, createError, defineEventHandler, setHeader, setHeaders, setResponseStatus } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'

interface ApiCatalogRuntimeConfig {
  href: string
  mediaType: string
  document: { linkset: Array<Record<string, unknown>> }
}

export default defineEventHandler((event) => {
  setHeader(event, 'Access-Control-Allow-Origin', '*')

  if (event.method === 'OPTIONS') {
    setHeaders(event, {
      'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
      'Access-Control-Allow-Methods': 'GET, HEAD',
    })
    setResponseStatus(event, 204)
    return null
  }

  assertMethod(event, ['GET', 'HEAD'])

  const config = (useRuntimeConfig(event)['nuxt-ai-ready'] as unknown as {
    apiCatalog?: ApiCatalogRuntimeConfig
  }).apiCatalog
  if (!config)
    throw createError({ statusCode: 404, message: 'API catalog is not configured' })

  setHeader(event, 'content-type', config.mediaType)
  setHeader(event, 'link', `<${config.href}>; rel="api-catalog"`)

  if (event.method === 'HEAD')
    return

  return config.document
})
