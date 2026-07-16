import type { NitroApp } from 'nitropack/types'
import { storePrerenderedHtml } from '../utils/prerender-html'

// Capture every page's rendered HTML during prerendering so the markdown
// prerender middleware can reuse it instead of re-rendering the page.
export default function htmlCapturePlugin(nitroApp: NitroApp) {
  if (!import.meta.prerender)
    return

  nitroApp.hooks.hook('render:response', (response, { event }) => {
    if (typeof response.body !== 'string' || !String(response.headers?.['content-type'] || '').includes('text/html'))
      return
    storePrerenderedHtml(event.path, response.body)
  })
}
