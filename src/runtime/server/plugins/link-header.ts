import type { H3Event } from '#nuxtseo/h3'
import { getHeader, getResponseStatus, setHeader } from '#nuxtseo/h3'
import { defineNitroPlugin } from '#nuxtseo/nitro'

export const STATUS_AWARE_LINK_HEADER = 'nuxt-ai-ready:status-aware-link-header'
export const ERROR_LINK_HEADER = 'x-nuxt-ai-ready-error-link'

export interface StatusAwareLinkHeader {
  error: string
  success: string
}

type LinkHeaderEvent = H3Event & {
  context: H3Event['context'] & {
    [STATUS_AWARE_LINK_HEADER]?: StatusAwareLinkHeader
  }
}

export function setStatusAwareLinkHeader(event: H3Event, safeHeader: string, successHeader?: string): void {
  (event as LinkHeaderEvent).context[STATUS_AWARE_LINK_HEADER] = {
    error: safeHeader,
    success: successHeader ?? safeHeader,
  }
  setHeader(event, 'link', safeHeader)
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('error', (_error, { event }) => {
    if (!event)
      return

    const header = (event as LinkHeaderEvent).context[STATUS_AWARE_LINK_HEADER]
    if (header)
      event.node.req.headers[ERROR_LINK_HEADER] = header.error
  })

  nitro.hooks.hook('beforeResponse', (event) => {
    const header = (event as LinkHeaderEvent).context[STATUS_AWARE_LINK_HEADER]
    if (!header)
      return

    setHeader(event, 'link', getResponseStatus(event) >= 400 ? header.error : header.success)
  })

  nitro.hooks.hook('render:html', (_html, { event }) => {
    const header = (event as LinkHeaderEvent).context[STATUS_AWARE_LINK_HEADER]
    // Nuxt forwards request headers to its internal error render.
    const errorHeader = event.path.startsWith('/__nuxt_error')
      ? getHeader(event, ERROR_LINK_HEADER)
      : undefined
    if (errorHeader) {
      setHeader(event, 'link', errorHeader)
      return
    }
    if (header)
      setHeader(event, 'link', getResponseStatus(event) >= 400 ? header.error : header.success)
  })
})
