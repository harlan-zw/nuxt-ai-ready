import type { McpServerCard } from '../../../utils/mcp-server-card'
import { eventHandler, setHeaders } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

interface McpServerCardRuntimeConfig {
  card: McpServerCard
  cacheMaxAge: number
}

export default eventHandler((event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as unknown as {
    mcpServerCard: McpServerCardRuntimeConfig
  }

  setHeaders(event, {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, HEAD',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `public, max-age=${config.mcpServerCard.cacheMaxAge}`,
    'Content-Type': 'application/json; charset=utf-8',
  })

  return event.method === 'HEAD' ? null : config.mcpServerCard.card
})
