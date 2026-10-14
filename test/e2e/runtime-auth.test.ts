import { hkdfSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { fetch, setup, startServer, stopServer, url } from '@nuxt/test-utils/e2e'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

const root = 'runtime-only-application-secret-32-characters'
const token = Buffer.from(hkdfSync('sha256', root, 'nuxt', 'nuxt-ai-ready:runtime-sync', 32)).toString('hex')
const headers = { authorization: `Bearer ${token}` }

describe('runtime-only application secret', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/runtime-indexing', import.meta.url)),
    dev: false,
    server: true,
    nuxtConfig: { runtimeConfig: { appSecret: '' } },
    env: { NUXT_APP_SECRET: root },
  })

  it('authenticates with a root secret supplied only when the server starts', async () => {
    const response = await fetch('/__ai-ready/status', { headers })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ total: expect.any(Number) })
  })

  it.each([
    ['status', 'GET'],
    ['poll', 'POST'],
    ['prune', 'POST'],
    ['restore', 'POST'],
    ['reindex', 'POST'],
    ['cron', 'GET'],
  ])('rejects unauthenticated %s requests', async (route, method) => {
    expect((await fetch(`/__ai-ready/${route}`, { method })).status).toBe(401)
  })

  it('rejects the root secret and preserves deprecated query tokens', async () => {
    expect((await fetch('/__ai-ready/status', { headers: { authorization: `Bearer ${root}` } })).status).toBe(401)
    expect((await fetch(`/__ai-ready/status?secret=${token}`)).status).toBe(200)
  })

  it('authenticates the CLI without a build-time token cache', async () => {
    const result = await execa(process.execPath, [fileURLToPath(new URL('../../dist/cli.mjs', import.meta.url)), 'status', '--url', url('/')], {
      reject: false,
      env: { NUXT_APP_SECRET: root, CONSOLA_LEVEL: '3' },
    })
    expect(result.exitCode, result.stderr).toBe(0)
    expect(result.stdout).toContain('Total pages:')
  })

  it.each(['', 'short'])('fails closed with an invalid runtime root: %s', async (value) => {
    await stopServer()
    await startServer({ env: { NUXT_APP_SECRET: value } })
    expect((await fetch('/__ai-ready/status', { headers })).status).toBe(500)
    expect((await fetch('/about')).status).toBe(200)
  })

  it('accepts a rotated root and rejects the previous token', async () => {
    const rotated = 'rotated-runtime-application-secret-32-characters'
    const rotatedToken = Buffer.from(hkdfSync('sha256', rotated, 'nuxt', 'nuxt-ai-ready:runtime-sync', 32)).toString('hex')
    await stopServer()
    await startServer({ env: { NUXT_APP_SECRET: rotated } })
    expect((await fetch('/__ai-ready/status', { headers })).status).toBe(401)
    expect((await fetch('/__ai-ready/status', { headers: { authorization: `Bearer ${rotatedToken}` } })).status).toBe(200)
  })
})
