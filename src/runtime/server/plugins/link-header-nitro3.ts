import type { RequestEvent } from 'nuxt/server'
import type { StatusAwareLinkHeader } from './link-header'
import { getRequestHeader, getRequestURL } from 'nuxt/server'
import { defineNitroPlugin } from '#nuxtseo/nitro'
import { ERROR_LINK_HEADER, STATUS_AWARE_LINK_HEADER } from './link-header'

interface RenderResponse { statusCode?: number, headers?: Record<string, string> }
interface Nitro3LinkHooks {
  hook: {
    (name: 'error', callback: (error: unknown, context: { event?: RequestEvent }) => void): void
    (name: 'response', callback: (response: Response, event: RequestEvent) => void): void
    (name: 'render:response', callback: (response: RenderResponse, context: { event: RequestEvent }) => void): void
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

  hooks.hook('render:response', (response, { event }) => {
    const errorHeader = getRequestURL(event).pathname.startsWith('/__nuxt_error') && getRequestHeader(event, 'x-nuxt-error') === 'true'
      ? getRequestHeader(event, ERROR_LINK_HEADER)
      : undefined
    const header = readHeader(event)
    const link = errorHeader || (header && ((response.statusCode ?? event.res?.status ?? 200) >= 400 ? header.error : header.success))
    if (!link)
      return
    response.headers ||= {}
    response.headers.link = link
  })
})
