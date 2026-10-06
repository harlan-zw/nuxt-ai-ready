import type { useNitroApp } from '#nuxtseo/nitro'
import { getRequestURL } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { toLogicalRoute } from '../../route-path'
import { storePrerenderedHtml } from '../utils/prerender-html'

type NitroApp = ReturnType<typeof useNitroApp>

export default function htmlCapturePlugin(nitroApp: NitroApp) {
  if (!import.meta.prerender)
    return

  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const baseURL = useRuntimeConfig(event).app.baseURL
    // Keep the context until consumption so later render hooks can finish it.
    storePrerenderedHtml(toLogicalRoute(getRequestURL(event).pathname, baseURL), html)
  })
}
