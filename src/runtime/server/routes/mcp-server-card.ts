import { defineEventHandler, getRequestHeader, setResponseStatus, useRuntimeConfig } from 'nuxt/server'
import { matchesDiscoveryEtag, MCP_SERVER_CARD_MEDIA_TYPE } from '../utils/discovery-response'

interface McpServerCardRuntimeConfig {
  card: Record<string, unknown>
  cacheMaxAge: number
  etag: string
}
export default defineEventHandler((event) => {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as unknown as {
    mcpServerCard: McpServerCardRuntimeConfig
  }
  Object.entries({
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Allow-Methods': 'GET, HEAD',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'ETag',
    'Cache-Control': `public, max-age=${config.mcpServerCard.cacheMaxAge}`,
    'Content-Type': MCP_SERVER_CARD_MEDIA_TYPE,
    'ETag': config.mcpServerCard.etag,
  }).forEach(([name, value]) => event.res.headers.set(name, value))
  if (event.req.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return null
  }
  if (matchesDiscoveryEtag(getRequestHeader(event, 'if-none-match'), config.mcpServerCard.etag)) {
    setResponseStatus(event, 304)
    return null
  }
  return config.mcpServerCard.card
})
