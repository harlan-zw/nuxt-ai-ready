import { eventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

/**
 * Key verification endpoint for IndexNow
 * Returns the API key as plain text for search engine verification
 */
export default eventHandler((event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as { indexNowKey?: string }

  if (!config.indexNowKey)
    return null // 404

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return config.indexNowKey
})
