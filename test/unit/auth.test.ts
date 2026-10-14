import { hkdfSync } from 'node:crypto'
import { createApp, eventHandler, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAuth } from '../../src/runtime/server/utils/auth'

const state = vi.hoisted(() => ({ root: undefined as unknown, bindings: undefined as Record<string, unknown> | undefined }))
const root = 'application-secret-for-all-nuxt-modules'
const purpose = 'nuxt-ai-ready:runtime-sync'
const token = (secret: string, usage = purpose) => Buffer.from(hkdfSync('sha256', secret, 'nuxt', usage, 32)).toString('hex')

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ 'appSecret': state.root, 'nuxt-ai-ready': {} }),
}))
vi.mock('nuxt/server', () => ({
  deriveSecret: async (usage: string) => {
    if (typeof state.root !== 'string' || state.root.length < 32)
      throw new Error('Set NUXT_APP_SECRET to at least 32 characters.')
    return token(state.root, usage)
  },
}))

const app = createApp()
app.use(eventHandler(async (event) => {
  if (state.bindings)
    event.context.cloudflare = { env: state.bindings }
  await requireAuth(event)
  return { authorized: true }
}))
const request = toWebHandler(app)
function authorize(bearer?: string, query = '') {
  return request(new Request(`http://localhost/__ai-ready/status${query}`, {
    headers: bearer === undefined ? {} : { authorization: `Bearer ${bearer}` },
  }))
}

describe('runtime sync authentication', () => {
  beforeEach(() => {
    state.root = root
    state.bindings = undefined
  })

  it('accepts the Nuxt purpose-derived token', async () => {
    expect((await authorize(token(root))).status).toBe(200)
  })

  it.each([undefined, root, token(root, 'nuxt-og-image:url-signing'), 'incorrect'])('rejects an invalid bearer token: %s', async (bearer) => {
    expect((await authorize(bearer)).status).toBe(401)
  })

  it('rejects query-string authentication', async () => {
    expect((await authorize(undefined, `?secret=${token(root)}`)).status).toBe(401)
  })

  it.each([undefined, '', 'too-short', 1234, false, [], {}])('fails closed for an invalid application secret: %s', async (value) => {
    state.root = value
    expect((await authorize(token(root))).status).toBe(500)
  })

  it('uses a runtime-only Cloudflare binding and observes rotation', async () => {
    state.root = undefined
    state.bindings = { NUXT_APP_SECRET: root }
    expect((await authorize(token(root))).status).toBe(200)

    const rotated = 'a-different-application-secret-for-nuxt'
    state.bindings = { NUXT_APP_SECRET: rotated }
    expect((await authorize(token(root))).status).toBe(401)
    expect((await authorize(token(rotated))).status).toBe(200)
  })

  it.each(['', 'short', 1234, null])('rejects an invalid Worker override instead of using the build secret: %s', async (value) => {
    state.bindings = { NUXT_APP_SECRET: value }
    expect((await authorize(token(root))).status).toBe(500)
  })
})
