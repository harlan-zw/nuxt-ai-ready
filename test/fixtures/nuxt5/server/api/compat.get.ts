import { defineEventHandler } from 'nuxt/server'
import { countPages } from '#ai-ready/server'
import { useEvent, useRuntimeConfig } from '#nuxtseo/nitro'

function readRequestContextMarker() {
  return (useEvent().context as Record<string, unknown>).aiReadyCompatMarker
}

export default defineEventHandler(async (event) => {
  ;(event.context as Record<string, unknown>).aiReadyCompatMarker = 'nuxt-5-context'
  return {
    marker: useRuntimeConfig().aiReadyCompatMarker,
    requestContextMarker: readRequestContextMarker(),
    pageCount: await countPages(event),
  }
})
