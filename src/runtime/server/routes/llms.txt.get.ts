import { assertMethod, createError, eventHandler, getRequestURL, setHeader } from '#nuxtseo/h3'
import { defineCachedFunction, useRuntimeConfig } from '#nuxtseo/nitro'
import { publicCacheControl } from '../../cache-control'
import { buildLlmsTxtFiles } from '../../llms-txt-utils'
import { toLogicalRoute } from '../../route-path'

const cachedBuilders = new Map<number, (event: Parameters<typeof buildLlmsTxtFiles>[0]) => ReturnType<typeof buildLlmsTxtFiles>>()

function getBuildLlmsTxtCached(maxAge: number) {
  let cached = cachedBuilders.get(maxAge)
  if (!cached) {
    cached = defineCachedFunction(buildLlmsTxtFiles, {
      name: 'llms-txt-files',
      group: 'ai-ready',
      maxAge,
      swr: true,
      // Share one discovery snapshot between root and child files, separated by origin.
      getKey: event => getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin,
    })
    cachedBuilders.set(maxAge, cached)
  }
  return cached
}

export default eventHandler(async (event) => {
  assertMethod(event, 'GET', true)
  const runtimeConfig = useRuntimeConfig(event)
  const config = runtimeConfig['nuxt-ai-ready'] as any
  const cacheSeconds = config.llmsTxtCacheSeconds
  const cacheEnabled = !import.meta.dev && cacheSeconds > 0
  const files = cacheEnabled
    ? await getBuildLlmsTxtCached(cacheSeconds)(event)
    : await buildLlmsTxtFiles(event)
  const path = toLogicalRoute(event.path.split('?')[0]!, runtimeConfig.app.baseURL)
  const content = files[path]
  if (content === undefined)
    throw createError({ statusCode: 404, statusMessage: 'llms.txt file not found' })

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  if (cacheEnabled)
    setHeader(event, 'Cache-Control', publicCacheControl(cacheSeconds, 3600))
  return content
})
