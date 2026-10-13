import type { RequestEvent } from 'nuxt/server'
import { defineNitroPlugin, useRuntimeConfig } from '#nuxtseo/nitro'
import { toLogicalRoute } from '../../route-path'
import { storePrerenderedContentSignal } from '../utils/prerender-html'

interface ResponseHooks {
  hook: (name: 'response', callback: (response: Response, event: RequestEvent) => void) => void
}

export default defineNitroPlugin((nitro) => {
  const hooks = nitro.hooks as unknown as ResponseHooks
  hooks.hook('response', (response, event) => {
    const policy = response.headers.get('content-signal')
    const config = useRuntimeConfig()
    const sharedPolicy = (config['nuxt-robots'] as { contentSignalHeader?: string } | undefined)?.contentSignalHeader
    if (policy !== null && policy !== sharedPolicy)
      storePrerenderedContentSignal(toLogicalRoute(event.url.pathname, config.app.baseURL), policy)
  })
})
