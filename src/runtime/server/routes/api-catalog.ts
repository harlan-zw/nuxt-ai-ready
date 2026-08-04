import type { ModulePublicRuntimeConfig } from '../../../module'
import { assertMethod, defineEventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

export default defineEventHandler((event) => {
  assertMethod(event, ['GET', 'HEAD'])

  const config = (useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig).apiCatalog
  if (!config)
    return

  setHeader(event, 'content-type', config.mediaType)
  setHeader(event, 'link', `<${config.href}>; rel="api-catalog"`)

  if (event.method === 'HEAD')
    return

  return config.document
})
