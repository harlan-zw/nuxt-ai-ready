import type { RequestEvent } from 'nuxt/server'
import type { StatusAwareLinkHeader } from './link-header'
import { defineNitroPlugin } from '#nuxtseo/nitro'
import { ERROR_LINK_HEADER, STATUS_AWARE_LINK_HEADER } from './link-header'

interface Nitro3LinkHooks {
  hook: {
    (name: 'error', callback: (error: unknown, context: { event?: RequestEvent }) => void): void
    (name: 'response', callback: (response: Response, event: RequestEvent) => void): void
  }
}

function readHeader(event: Pick<RequestEvent, 'context'>): StatusAwareLinkHeader | undefined {
  return event.context[STATUS_AWARE_LINK_HEADER] as StatusAwareLinkHeader | undefined
}

export default defineNitroPlugin((nitro) => {
  // Selected only for Nitro 3. Keep the native hook boundary explicit while
  // the maintainer's app provides Nitro 2 types.
  const hooks = nitro.hooks as unknown as Nitro3LinkHooks
  hooks.hook('error', (_error, { event }) => {
    if (!event)
      return
    const header = readHeader(event)
    if (header)
      event.req.headers.set(ERROR_LINK_HEADER, header.error)
  })

  hooks.hook('response', (response, event) => {
    const header = readHeader(event)
    if (header)
      response.headers.set('link', response.status >= 400 ? header.error : header.success)
  })
})
