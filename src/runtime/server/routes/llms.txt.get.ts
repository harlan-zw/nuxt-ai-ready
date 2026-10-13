import { eventHandler, setHeader } from '#nuxtseo/h3'
import { defineCachedFunction, useRuntimeConfig } from '#nuxtseo/nitro'
import { publicCacheControl } from '../../cache-control'
import { buildLlmsTxt } from '../../llms-txt-utils'

const cachedBuilders = new Map<number, (event: Parameters<typeof buildLlmsTxt>[0]) => ReturnType<typeof buildLlmsTxt>>()

function getBuildLlmsTxtCached(maxAge: number) {
  let cached = cachedBuilders.get(maxAge)
  if (!cached) {
    cached = defineCachedFunction(buildLlmsTxt, {
      name: 'llms-txt',
      group: 'ai-ready',
      maxAge,
      swr: true,
    })
    cachedBuilders.set(maxAge, cached)
  }
  return cached
}

export default eventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)['nuxt-ai-ready'] as any
  const cacheSeconds = runtimeConfig.llmsTxtCacheSeconds
  // Build output must reflect this build's page index and configuration.
  // An early queued request or a previous build can populate Nitro's cache.
  const cacheEnabled = !import.meta.dev && !import.meta.prerender && cacheSeconds > 0

  const content = cacheEnabled
    ? await getBuildLlmsTxtCached(cacheSeconds)(event)
    : await buildLlmsTxt(event)

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  if (cacheEnabled) {
    setHeader(event, 'Cache-Control', publicCacheControl(cacheSeconds, 3600))
  }

  return content
})
