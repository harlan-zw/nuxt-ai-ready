import type { RequestEvent } from 'nuxt/schema'
import type * as NuxtServer from 'nuxt/server'
import { isNuxtError } from 'nuxt/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const config: {
  apiCatalog?: { href: string, mediaType: string, document: { linkset: Array<Record<string, unknown>> } }
} = {}

vi.mock('nuxt/server', async importOriginal => ({
  ...await importOriginal<typeof NuxtServer>(),
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': config }),
}))

const { default: apiCatalogHandler } = await import('../../src/runtime/server/routes/api-catalog')

function catalogConfig() {
  return {
    href: 'https://example.com/.well-known/api-catalog',
    mediaType: 'application/linkset+json',
    document: { linkset: [{ anchor: 'https://example.com/' }] },
  }
}

async function call(method: string) {
  const url = new URL('http://localhost/.well-known/api-catalog')
  const event: RequestEvent = { req: new Request(url, { method }), url, res: { headers: new Headers() }, context: {} }
  const body = await Promise.resolve().then(() => apiCatalogHandler(event)).catch((error: unknown) => {
    if (!isNuxtError(error))
      throw error
    event.res.status = error.status
    return null
  })
  return {
    status: event.res.status || 200,
    body: body == null ? '' : JSON.stringify(body),
    headers: event.res.headers,
  }
}

describe('gET /.well-known/api-catalog route', () => {
  beforeEach(() => {
    config.apiCatalog = catalogConfig()
  })

  it('answers OPTIONS with 204 and CORS headers', async () => {
    const { status, body, headers } = await call('OPTIONS')

    expect(status).toBe(204)
    expect(body).toBe('')
    expect(headers.get('access-control-allow-origin')).toBe('*')
    expect(headers.get('access-control-allow-methods')).toBe('GET, HEAD')
    expect(headers.get('access-control-allow-headers')).toBe('Content-Type, If-None-Match')
  })

  it('serves the catalog document with its media type and link header', async () => {
    const { status, body, headers } = await call('GET')

    expect(status).toBe(200)
    expect(JSON.parse(body)).toEqual(catalogConfig().document)
    expect(headers.get('content-type')).toBe(catalogConfig().mediaType)
    expect(headers.get('link')).toBe(`<${catalogConfig().href}>; rel="api-catalog"`)
  })

  it('grants the same cross-origin access on GET that OPTIONS advertises', async () => {
    const { status, headers } = await call('GET')

    expect(status).toBe(200)
    expect(headers.get('access-control-allow-origin')).toBe('*')
  })

  it('answers 404 when the runtime config is missing', async () => {
    config.apiCatalog = undefined

    const { status } = await call('GET')

    expect(status).toBe(404)
  })

  it('answers OPTIONS with CORS headers even when the runtime config is missing', async () => {
    config.apiCatalog = undefined

    const { status, headers } = await call('OPTIONS')

    expect(status).toBe(204)
    expect(headers.get('access-control-allow-origin')).toBe('*')
  })

  it('rejects unsupported methods with 405', async () => {
    const { status } = await call('POST')

    expect(status).toBe(405)
  })
})
