import { hkdfSync } from 'node:crypto'
import { createApp, eventHandler, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAuth } from '../../src/runtime/server/utils/auth'

const state = vi.hoisted(() => ({
  root: undefined as unknown,
  legacy: undefined as unknown,
  bindings: undefined as Record<string, unknown> | undefined,
  warn: vi.fn(),
}))
const root = 'application-secret-for-all-nuxt-modules'
const purpose = 'nuxt-ai-ready:runtime-sync'
const token = (secret: string, usage = purpose) => Buffer.from(hkdfSync('sha256', secret, 'nuxt', usage, 32)).toString('hex')

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ 'appSecret': state.root, 'nuxt-ai-ready': { runtimeSyncSecret: state.legacy } }),
}))
vi.mock('#ai-ready-virtual/logger.mjs', () => ({ logger: { warn: state.warn } }))
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
    state.legacy = undefined
    state.bindings = undefined
    state.warn.mockClear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('accepts the Nuxt purpose-derived token', async () => {
    expect((await authorize(token(root))).status).toBe(200)
  })

  it('accepts the legacy configured token and warns once', async () => {
    state.root = ''
    state.legacy = 'legacy-token'
    expect((await authorize('legacy-token')).status).toBe(200)
    expect((await authorize('legacy-token')).status).toBe(200)
    expect(state.warn).toHaveBeenCalledTimes(1)
    expect(state.warn).toHaveBeenCalledWith(expect.stringContaining('deprecated'))
  })

  it('prefers the shared root when a legacy token also exists', async () => {
    state.legacy = 'legacy-token'
    expect((await authorize(token(root))).status).toBe(200)
    expect((await authorize('legacy-token')).status).toBe(401)
  })

  it.each(['NUXT_AI_READY_RUNTIME_SYNC_SECRET', 'NUXT_NUXT_AI_READY_RUNTIME_SYNC_SECRET'])('accepts the legacy Worker binding %s', async (key) => {
    state.root = ''
    state.legacy = 'build-token'
    state.bindings = { [key]: 'runtime-token' }
    expect((await authorize('runtime-token')).status).toBe(200)
    expect((await authorize('build-token')).status).toBe(401)
  })

  it('rejects an invalid shared root instead of falling back to the legacy token', async () => {
    state.root = 'short'
    state.legacy = 'legacy-token'
    expect((await authorize('legacy-token')).status).toBe(500)
  })

  it.each(['NUXT_AI_READY_RUNTIME_SYNC_SECRET', 'NUXT_NUXT_AI_READY_RUNTIME_SYNC_SECRET'])('accepts the legacy environment override %s', async (key) => {
    state.root = ''
    state.legacy = 'build-token'
    vi.stubEnv(key, 'runtime-token')
    expect((await authorize('runtime-token')).status).toBe(200)
    expect((await authorize('build-token')).status).toBe(401)
  })

  it.each(['', null, false, 1234])('rejects an invalid legacy binding: %s', async (value) => {
    state.root = ''
    state.bindings = { NUXT_AI_READY_RUNTIME_SYNC_SECRET: value }
    expect((await authorize('legacy-token')).status).toBe(500)
  })

  it.each([undefined, root, token(root, 'nuxt-og-image:url-signing'), 'incorrect'])('rejects an invalid bearer token: %s', async (bearer) => {
    expect((await authorize(bearer)).status).toBe(401)
  })

  it('accepts existing query-string authentication with a deprecation warning', async () => {
    expect((await authorize(undefined, `?secret=${token(root)}`)).status).toBe(200)
    expect(state.warn).toHaveBeenCalledWith(expect.stringContaining('deprecated'))
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
