import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'

// Records how many times each route was SSR rendered during prerendering, then
// writes the tally to disk so a test can read it after the build.
//
// The page-level counter in app/utils/render-counts.ts cannot see routes that
// render as an error page, because an error page produces no body for the count
// to travel in. This plugin counts the render itself, so it covers those too.
export default defineNitroPlugin((nitroApp) => {
  if (!import.meta.prerender)
    return

  const file = (useRuntimeConfig() as { renderCountsFile?: string }).renderCountsFile
  if (!file)
    return

  const counts: Record<string, number> = {}
  let pending: Promise<void> = Promise.resolve()

  // A route that errors renders through `/__nuxt_error`, carrying the real
  // route in its `url` query. Count it against that route, so an error page and
  // a normal page are tallied the same way.
  const routeOf = (path: string): string => {
    if (!path.startsWith('/__nuxt_error'))
      return path
    return new URLSearchParams(path.slice(path.indexOf('?') + 1)).get('url') || path
  }

  nitroApp.hooks.hook('render:response', (response, { event }) => {
    if (!String(response.headers?.['content-type'] || '').includes('text/html'))
      return
    const route = routeOf(event.path)
    counts[route] = (counts[route] || 0) + 1
    // Written on every render because nitro offers no "prerender finished" hook
    // inside the server bundle. Writes are chained so they cannot interleave.
    pending = pending.then(async () => {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify(counts), 'utf-8')
    })
  })
})
