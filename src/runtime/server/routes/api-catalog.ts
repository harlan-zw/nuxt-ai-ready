import { assertMethod, defineEventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

interface ApiCatalogRuntimeConfig {
  href: string
  mediaType: string
  document: { linkset: Array<Record<string, unknown>> }
}

export default defineEventHandler((event) => {
  assertMethod(event, ['GET', 'HEAD'])

  const config = (useRuntimeConfig(event)['nuxt-ai-ready'] as unknown as {
    apiCatalog?: ApiCatalogRuntimeConfig
  }).apiCatalog
  if (!config)
    return

  setHeader(event, 'content-type', config.mediaType)
  setHeader(event, 'link', `<${config.href}>; rel="api-catalog"`)

  if (event.method === 'HEAD')
    return

  return config.document
})
