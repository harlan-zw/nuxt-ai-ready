import type { H3Event } from '#nuxtseo/h3'
import { getResponseStatus, setHeader } from '#nuxtseo/h3'
import { defineNitroPlugin } from '#nuxtseo/nitro'

const SUCCESS_LINK_HEADER = 'nuxt-ai-ready:success-link-header'

type LinkHeaderEvent = H3Event & {
  context: H3Event['context'] & {
    [SUCCESS_LINK_HEADER]?: string
  }
}

export function setStatusAwareLinkHeader(event: H3Event, safeHeader: string, successHeader?: string): void {
  setHeader(event, 'link', safeHeader)
  if (successHeader)
    (event as LinkHeaderEvent).context[SUCCESS_LINK_HEADER] = successHeader
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('beforeResponse', (event) => {
    if (getResponseStatus(event) >= 400)
      return

    const successHeader = (event as LinkHeaderEvent).context[SUCCESS_LINK_HEADER]
    if (successHeader)
      setHeader(event, 'link', successHeader)
  })
})
