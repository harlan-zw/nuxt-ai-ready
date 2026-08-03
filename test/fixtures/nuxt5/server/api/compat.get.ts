import { eventHandler } from '#nuxtseo/h3'
import { useEvent, useRuntimeConfig } from '#nuxtseo/nitro'

function readRequestContextMarker() {
  return (useEvent().context as Record<string, unknown>).aiReadyCompatMarker
}

export default eventHandler((event) => {
  ;(event.context as Record<string, unknown>).aiReadyCompatMarker = 'nuxt-5-context'
  return {
    marker: useRuntimeConfig().aiReadyCompatMarker,
    requestContextMarker: readRequestContextMarker(),
  }
})
