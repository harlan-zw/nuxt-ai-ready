import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { STATUS_AWARE_LINK_HEADER } from '../../src/runtime/server/plugins/link-header'
import linkHeaderPlugin from '../../src/runtime/server/plugins/link-header-nitro3'

vi.mock('#nuxtseo/nitro', () => ({ defineNitroPlugin: (plugin: unknown) => plugin }))

type ResponseHook = (response: Response, event: { context: Record<string, unknown> }) => void

function installResponseHook(): ResponseHook {
  const hooks: Record<string, unknown> = {}
  const nitro = {
    hooks: {
      hook: (name: string, callback: unknown) => {
        hooks[name] = callback
      },
    },
  }
  ;(linkHeaderPlugin as unknown as (app: typeof nitro) => void)(nitro)
  return hooks.response as ResponseHook
}

const header = { error: '</fr/missing.md>; rel="alternate"', success: '</fr/page.md>; rel="alternate", </page>; rel="alternate"; hreflang="en"' }
const event = () => ({ context: { [STATUS_AWARE_LINK_HEADER]: header } })

describe('nitro 3 status-aware Link header', () => {
  const server = createServer((_req, res) => {
    res.statusCode = 404
    res.end('upstream missing')
  })
  let origin = ''

  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

  it('sets the error links on an error response', () => {
    const response = new Response('missing', { status: 404 })

    installResponseHook()(response, event())

    expect(response.headers.get('link')).toBe(header.error)
  })

  it('sets the success links on a successful response', () => {
    const response = new Response('ok')

    installResponseHook()(response, event())

    expect(response.headers.get('link')).toBe(header.success)
  })

  // h3 returns a handler's own error Response unchanged, and fetch() makes its headers immutable.
  it('leaves a forwarded fetch() error response alone', async () => {
    const response = await fetch(origin)

    expect(() => installResponseHook()(response, event())).not.toThrow()
    expect(response.status).toBe(404)
    expect(response.headers.get('link')).toBeNull()
  })
})
