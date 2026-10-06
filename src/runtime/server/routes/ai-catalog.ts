import type { AiCatalog } from '../utils/discovery-response'
import { defineEventHandler, getRequestHeader, setResponseStatus, useRuntimeConfig } from 'nuxt/server'
import { AI_CATALOG_MEDIA_TYPE, matchesDiscoveryEtag } from '../utils/discovery-response'

interface AiCatalogRuntimeConfig {
  cacheMaxAge: number
  document: AiCatalog
  etag: string
}
export default defineEventHandler((event) => {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as unknown as {
    aiCatalog: AiCatalogRuntimeConfig
  }
  Object.entries({
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Allow-Methods': 'GET, HEAD',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'ETag',
    'Cache-Control': `public, max-age=${config.aiCatalog.cacheMaxAge}`,
    'Content-Type': AI_CATALOG_MEDIA_TYPE,
    'ETag': config.aiCatalog.etag,
  }).forEach(([name, value]) => event.res.headers.set(name, value))
  if (event.req.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return null
  }
  if (matchesDiscoveryEtag(getRequestHeader(event, 'if-none-match'), config.aiCatalog.etag)) {
    setResponseStatus(event, 304)
    return null
  }
  return config.aiCatalog.document
})
