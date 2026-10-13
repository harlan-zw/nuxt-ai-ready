import { getRequestURL, getResponseHeader } from '#nuxtseo/h3'
import { defineNitroPlugin, useRuntimeConfig } from '#nuxtseo/nitro'
import { toLogicalRoute } from '../../route-path'
import { storePrerenderedContentSignal } from '../utils/prerender-html'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('beforeResponse', (event) => {
    const policy = getResponseHeader(event, 'content-signal')
    const config = useRuntimeConfig(event)
    const sharedPolicy = (config['nuxt-robots'] as { contentSignalHeader?: string } | undefined)?.contentSignalHeader
    // Nuxt Robots publishes its shared fallback. Per-page copies would consume the static rule budget.
    if (typeof policy === 'string' && policy !== sharedPolicy)
      storePrerenderedContentSignal(toLogicalRoute(getRequestURL(event).pathname, config.app.baseURL), policy)
  })
})
