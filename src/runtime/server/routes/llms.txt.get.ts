import { eventHandler, setHeader } from '#nuxtseo/h3'
import { defineCachedFunction, useRuntimeConfig } from '#nuxtseo/nitro'
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
  const cacheEnabled = !import.meta.dev && cacheSeconds > 0

  const content = cacheEnabled
    ? await getBuildLlmsTxtCached(cacheSeconds)(event)
    : await buildLlmsTxt(event)

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  if (cacheEnabled) {
    setHeader(event, 'Cache-Control', `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`)
  }

  return content
})
