import { eventHandler, getHeader, setHeaders, setResponseStatus } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { matchesDiscoveryEtag, MCP_SERVER_CARD_MEDIA_TYPE } from '../utils/discovery-response'

interface McpServerCardRuntimeConfig {
  card: Record<string, unknown>
  cacheMaxAge: number
  etag: string
}

export default eventHandler((event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as unknown as {
    mcpServerCard: McpServerCardRuntimeConfig
  }

  setHeaders(event, {
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Allow-Methods': 'GET, HEAD',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'ETag',
    'Cache-Control': `public, max-age=${config.mcpServerCard.cacheMaxAge}`,
    'Content-Type': MCP_SERVER_CARD_MEDIA_TYPE,
    'ETag': config.mcpServerCard.etag,
  })

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return null
  }

  if (matchesDiscoveryEtag(getHeader(event, 'if-none-match'), config.mcpServerCard.etag)) {
    setResponseStatus(event, 304)
    return null
  }

  return config.mcpServerCard.card
})
