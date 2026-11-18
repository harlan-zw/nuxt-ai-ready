import { hkdfSync } from 'node:crypto'
import { createApp, eventHandler, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAuth } from '../../src/runtime/server/utils/auth'

const state = vi.hoisted(() => ({
  root: undefined as unknown,
  eventConfig: undefined as { appSecret: unknown } | undefined,
  legacy: undefined as unknown,
  bindings: undefined as Record<string, unknown> | undefined,
  derive: vi.fn<(usage: string) => Promise<string>>(),
}))
let root: string
let sequence = 0
const purpose = 'nuxt-ai-ready:runtime-sync'
const token = (secret: string, usage = purpose) => Buffer.from(hkdfSync('sha256', secret, 'nuxt', usage, 32)).toString('hex')

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: (event?: unknown) => event && state.eventConfig
    ? state.eventConfig
    : { 'appSecret': state.root, 'nuxt-ai-ready': { runtimeSyncSecret: state.legacy } },
}))
vi.mock('nuxt/server', () => ({
  deriveSecret: state.derive,
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
    root = `application-secret-for-all-nuxt-modules-${++sequence}`
    state.root = root
    state.eventConfig = undefined
    state.legacy = undefined
    state.bindings = undefined
    state.derive.mockReset().mockImplementation(async (usage) => {
      if (typeof state.root !== 'string' || state.root.length < 32)
        throw new Error('Invalid application secret.')
      return token(state.root, usage)
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('accepts the Nuxt purpose-derived token', async () => {
    expect((await authorize(token(root))).status).toBe(200)
  })

  it('rejects the removed configured token without an application secret', async () => {
    state.root = ''
    state.legacy = 'legacy-token'
    expect((await authorize('legacy-token')).status).toBe(500)
  })

  it('prefers the shared root when a legacy token also exists', async () => {
    state.legacy = 'legacy-token'
    expect((await authorize(token(root))).status).toBe(200)
    expect((await authorize('legacy-token')).status).toBe(401)
  })

  it.each(['NUXT_AI_READY_RUNTIME_SYNC_SECRET', 'NUXT_NUXT_AI_READY_RUNTIME_SYNC_SECRET'])('ignores the removed Worker binding %s', async (key) => {
    state.root = ''
    state.legacy = 'build-token'
    state.bindings = { [key]: 'runtime-token' }
    expect((await authorize('runtime-token')).status).toBe(500)
  })

  it('rejects an invalid shared root instead of falling back to the legacy token', async () => {
    state.root = 'short'
    state.legacy = 'legacy-token'
    expect((await authorize('legacy-token')).status).toBe(500)
  })

  it.each(['NUXT_AI_READY_RUNTIME_SYNC_SECRET', 'NUXT_NUXT_AI_READY_RUNTIME_SYNC_SECRET'])('ignores the removed environment override %s', async (key) => {
    state.root = ''
    state.legacy = 'build-token'
    vi.stubEnv(key, 'runtime-token')
    expect((await authorize('runtime-token')).status).toBe(500)
  })

  it.each([undefined, 'incorrect'])('rejects an invalid bearer token: %s', async (bearer) => {
    expect((await authorize(bearer)).status).toBe(401)
  })

  it('rejects the root and tokens derived for other modules', async () => {
    expect((await authorize(root)).status).toBe(401)
    expect((await authorize(token(root, 'nuxt-og-image:url-signing'))).status).toBe(401)
  })

  it('rejects query-string tokens', async () => {
    expect((await authorize(undefined, `?secret=${token(root)}`)).status).toBe(401)
  })

  it.each([undefined, '', 'too-short', 1234, false, [], {}])('fails closed after a warm key for an invalid root: %s', async (value) => {
    expect((await authorize(token(root))).status).toBe(200)
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

  it.each(['', 'short', 1234, null])('rejects an invalid Worker override after a warm key: %s', async (value) => {
    state.bindings = { NUXT_APP_SECRET: root }
    expect((await authorize(token(root))).status).toBe(200)
    state.bindings = { NUXT_APP_SECRET: value }
    expect((await authorize(token(root))).status).toBe(500)
  })

  it('shares one Nuxt derivation across sequential requests', async () => {
    expect((await authorize(token(root))).status).toBe(200)
    expect((await authorize(token(root))).status).toBe(200)
    expect(state.derive).toHaveBeenCalledTimes(1)
  })

  it('keys Nuxt derivation by the shared root when event config differs', async () => {
    const rotated = `${root}-rotated`
    state.eventConfig = { appSecret: rotated }
    expect((await authorize(token(root))).status).toBe(200)
    expect((await authorize(token(rotated))).status).toBe(401)
    state.root = rotated
    expect((await authorize(token(rotated))).status).toBe(200)
    expect(state.derive).toHaveBeenCalledTimes(2)
  })

  it('keeps each concurrent request on its captured root', async () => {
    const pending = Promise.withResolvers<string>()
    state.derive.mockReturnValueOnce(pending.promise)
    const first = authorize(token(root))
    await vi.waitFor(() => expect(state.derive).toHaveBeenCalled())
    const rotated = `${root}-rotated`
    state.root = rotated
    expect((await authorize(token(rotated))).status).toBe(200)
    pending.resolve(token(root))
    expect((await first).status).toBe(200)
    expect((await authorize(token(rotated))).status).toBe(200)
    expect(state.derive).toHaveBeenCalledTimes(2)
  })

  it('shares in-flight derivation across concurrent requests', async () => {
    const pending = Promise.withResolvers<string>()
    state.derive.mockReturnValue(pending.promise)
    const first = authorize(token(root))
    const second = authorize(token(root))
    await vi.waitFor(() => expect(state.derive).toHaveBeenCalled())
    pending.resolve(token(root))
    expect((await first).status).toBe(200)
    expect((await second).status).toBe(200)
    expect(state.derive).toHaveBeenCalledTimes(1)
  })

  it('uses the rotated root and rejects the previous token', async () => {
    expect((await authorize(token(root))).status).toBe(200)
    const rotated = `${root}-rotated`
    state.root = rotated
    expect((await authorize(token(root))).status).toBe(401)
    expect((await authorize(token(rotated))).status).toBe(200)
    expect(state.derive).toHaveBeenCalledTimes(2)
  })

  it('retries a failed derivation', async () => {
    state.derive.mockRejectedValueOnce(new Error('Crypto service unavailable'))
    expect((await authorize(token(root))).status).toBe(500)
    expect((await authorize(token(root))).status).toBe(200)
    expect(state.derive).toHaveBeenCalledTimes(2)
  })

  it('keeps a newer key when an earlier derivation rejects', async () => {
    const pending = Promise.withResolvers<string>()
    state.derive.mockReturnValueOnce(pending.promise)
    const first = authorize(token(root))
    await vi.waitFor(() => expect(state.derive).toHaveBeenCalled())
    const rotated = `${root}-rotated`
    state.root = rotated
    expect((await authorize(token(rotated))).status).toBe(200)
    pending.reject(new Error('Old derivation failed'))
    expect((await first).status).toBe(500)
    expect((await authorize(token(rotated))).status).toBe(200)
    expect(state.derive).toHaveBeenCalledTimes(2)
  })

  it('shares a Worker key across concurrent requests', async () => {
    const derive = vi.spyOn(crypto.subtle, 'deriveBits')
    state.root = undefined
    state.bindings = { NUXT_APP_SECRET: root }
    const responses = await Promise.all([authorize(token(root)), authorize(token(root))])
    expect(responses.map(response => response.status)).toEqual([200, 200])
    expect(derive).toHaveBeenCalledTimes(1)
  })

  it('uses Nuxt derivation after a binding-only request with the same root', async () => {
    state.root = undefined
    state.bindings = { NUXT_APP_SECRET: root }
    expect((await authorize(token(root))).status).toBe(200)
    state.root = root
    state.bindings = undefined
    expect((await authorize(token(root))).status).toBe(200)
    expect(state.derive).toHaveBeenCalledTimes(1)
  })

  it('rejects a bearer token with a different byte length', async () => {
    expect((await authorize('é'.repeat(64))).status).toBe(401)
  })
})
