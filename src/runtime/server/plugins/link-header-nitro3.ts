import type { RequestEvent } from 'nuxt/server'
import type { StatusAwareLinkHeader } from './link-header'
import { defineNitroPlugin } from '#nuxtseo/nitro'
import { STATUS_AWARE_LINK_HEADER } from './link-header'

interface Nitro3LinkHooks {
  hook: (name: 'response', callback: (response: Response, event: RequestEvent) => void) => void
}

function readHeader(event: Pick<RequestEvent, 'context'>): StatusAwareLinkHeader | undefined {
  return event.context[STATUS_AWARE_LINK_HEADER] as StatusAwareLinkHeader | undefined
}

/**
 * H3 returns a handler's own error `Response` unchanged. When it came from
 * `fetch()`, its headers are immutable and `set` throws a TypeError. That
 * response never received the prepared Link header, so it stays as the
 * handler built it. Other errors still reach Nitro's error hook.
 */
function setLinkUnlessImmutable(response: Response, value: string): void {
  try {
    response.headers.set('link', value)
  }
  catch (error) {
    if (!(error instanceof TypeError))
      throw error
  }
}

export default defineNitroPlugin((nitro) => {
  // Selected only for Nitro 3. Keep the native hook boundary explicit while
  // the maintainer's app provides Nitro 2 types.
  const hooks = nitro.hooks as unknown as Nitro3LinkHooks
  // The response hook also sees error pages, so error links need no request
  // header here. Request headers are immutable on Cloudflare Workers.
  hooks.hook('response', (response, event) => {
    const header = readHeader(event)
    if (header)
      setLinkUnlessImmutable(response, response.status >= 400 ? header.error : header.success)
  })
})
