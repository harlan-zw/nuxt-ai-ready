import type { AiCatalog } from '../utils/discovery-response'
import { eventHandler, getHeader, setHeaders, setResponseStatus } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { AI_CATALOG_MEDIA_TYPE, matchesDiscoveryEtag } from '../utils/discovery-response'

interface AiCatalogRuntimeConfig {
  cacheMaxAge: number
  document: AiCatalog
  etag: string
}

export default eventHandler((event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as unknown as {
    aiCatalog: AiCatalogRuntimeConfig
  }

  setHeaders(event, {
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Allow-Methods': 'GET, HEAD',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'ETag',
    'Cache-Control': `public, max-age=${config.aiCatalog.cacheMaxAge}`,
    'Content-Type': AI_CATALOG_MEDIA_TYPE,
    'ETag': config.aiCatalog.etag,
  })

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return null
  }

  if (matchesDiscoveryEtag(getHeader(event, 'if-none-match'), config.aiCatalog.etag)) {
    setResponseStatus(event, 304)
    return null
  }

  return config.aiCatalog.document
})
