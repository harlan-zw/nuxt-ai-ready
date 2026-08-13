import type { H3Event } from '#nuxtseo/h3'
import { getHeader, getResponseStatus, setHeader } from '#nuxtseo/h3'
import { defineNitroPlugin } from '#nuxtseo/nitro'

const STATUS_AWARE_LINK_HEADER = 'nuxt-ai-ready:status-aware-link-header'
const ERROR_LINK_HEADER = 'x-nuxt-ai-ready-error-link'

interface StatusAwareLinkHeader {
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

  nitro.hooks.hook('render:response', (response, { event }) => {
    const header = (event as LinkHeaderEvent).context[STATUS_AWARE_LINK_HEADER]
    const errorHeader = event.path.startsWith('/__nuxt_error') && getHeader(event, 'x-nuxt-error') === 'true'
      ? getHeader(event, ERROR_LINK_HEADER)
      : undefined
    if (errorHeader) {
      response.headers ||= {}
      response.headers.link = errorHeader
      return
    }
    if (!header)
      return

    response.headers ||= {}
    const statusCode = response.statusCode ?? getResponseStatus(event)
    response.headers.link = statusCode >= 400 ? header.error : header.success
  })
})
