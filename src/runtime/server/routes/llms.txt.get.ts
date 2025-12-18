import { eventHandler, setHeader } from 'h3'
import { defineCachedFunction, useRuntimeConfig } from 'nitropack/runtime'
import { buildLlmsTxt } from '../../llms-txt-utils'

const buildLlmsTxtCached = defineCachedFunction(
  buildLlmsTxt,
  {
    name: 'llms-txt',
    group: 'ai-ready',
    maxAge: 60 * 10, // 10 minutes
    swr: true,
  },
)

export default eventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)['nuxt-ai-ready'] as any
  const cacheEnabled = !import.meta.dev && runtimeConfig.cacheMaxAgeSeconds > 0

  const content = cacheEnabled
    ? await buildLlmsTxtCached(event)
    : await buildLlmsTxt(event)

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  if (cacheEnabled) {
    setHeader(event, 'Cache-Control', `public, max-age=${runtimeConfig.cacheMaxAgeSeconds}, s-maxage=${runtimeConfig.cacheMaxAgeSeconds}, stale-while-revalidate=3600`)
  }

  return content
})
