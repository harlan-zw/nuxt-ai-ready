import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { getRequestHeaders, getRequestURL, getResponseHeaders } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { mergeVaryHeader } from '../../cache-control'

interface AssetsBinding {
  fetch: (request: Request) => Promise<Response>
}

/** Serve the original static HTML after negotiation, without rendering it again. */
export async function serveCloudflarePrerenderedPage(event: H3Event): Promise<Response | undefined> {
  if (event.method !== 'GET' && event.method !== 'HEAD')
    return

  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const url = getRequestURL(event)
  if (!config.cloudflarePrerenderedPages?.includes(url.pathname))
    return

  const assets = event.context.cloudflare?.env?.ASSETS as AssetsBinding | undefined
  if (!assets)
    return

  const response = await assets.fetch(new Request(url, { method: event.method, headers: getRequestHeaders(event) as HeadersInit }))
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(getResponseHeaders(event))) {
    if (value === undefined)
      continue
    const header = Array.isArray(value) ? value.join(', ') : String(value)
    headers.set(name, name.toLowerCase() === 'vary' ? mergeVaryHeader(headers.get(name) ?? undefined, header) : header)
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
