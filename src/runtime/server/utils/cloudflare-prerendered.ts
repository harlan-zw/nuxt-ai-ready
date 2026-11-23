import type { H3Event } from '#nuxtseo/h3'
import cloudflareFallbackPaths from '#ai-ready-virtual/cloudflare-fallback-paths.mjs'
import { getRequestHeaders, getRequestURL, getResponseHeaders } from '#nuxtseo/h3'
import { mergeVaryHeader } from '../../cache-control'

interface AssetsBinding {
  fetch: (request: Request) => Promise<Response>
}

/** Serve the original static HTML after negotiation, without rendering it again. */
export function serveCloudflarePrerenderedPage(event: H3Event): Promise<Response> | undefined {
  if (!cloudflareFallbackPaths.size)
    return
  if (event.method !== 'GET' && event.method !== 'HEAD')
    return

  const assets = event.context.cloudflare?.env?.ASSETS as AssetsBinding | undefined
  if (!assets)
    return

  const url = getRequestURL(event)
  if (!cloudflareFallbackPaths.has(url.pathname))
    return

  return assets.fetch(new Request(url, {
    method: event.method,
    headers: getRequestHeaders(event) as HeadersInit,
  })).then((response) => {
    const headers = new Headers(response.headers)
    for (const [name, value] of Object.entries(getResponseHeaders(event))) {
      if (value === undefined)
        continue
      const header = Array.isArray(value)
        ? value.join(', ')
        : String(value)
      headers.set(name, name.toLowerCase() === 'vary'
        ? mergeVaryHeader(headers.get(name) ?? undefined, header)
        : header)
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  })
}
