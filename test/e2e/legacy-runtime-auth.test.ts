import { hkdfSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { fetch, setup, startServer, stopServer } from '@nuxt/test-utils/e2e'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

const legacy = 'legacy-configured-runtime-token'
const rootDir = fileURLToPath(new URL('../fixtures/runtime-indexing', import.meta.url))

describe('legacy runtime sync secret', async () => {
  await setup({
    rootDir,
    dev: false,
    server: true,
    nuxtConfig: { runtimeConfig: { appSecret: '' }, aiReady: { runtimeSyncSecret: legacy } },
  })

  it('accepts the configured legacy token without an application secret', async () => {
    const response = await fetch('/__ai-ready/status', { headers: { authorization: `Bearer ${legacy}` } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ total: expect.any(Number) })
  })

  it('rejects requests without the legacy bearer token', async () => {
    expect((await fetch('/__ai-ready/status')).status).toBe(401)
  })

  it('keeps the configured legacy token available through the CLI cache', async () => {
    const result = await execa(process.execPath, [fileURLToPath(new URL('../../dist/cli.mjs', import.meta.url)), 'token', '--cwd', rootDir])
    expect(result.stdout.trim()).toBe(legacy)
  })

  it.each(['NUXT_AI_READY_RUNTIME_SYNC_SECRET', 'NUXT_NUXT_AI_READY_RUNTIME_SYNC_SECRET'])('accepts the legacy environment key %s at server startup', async (key) => {
    await stopServer()
    await startServer({ env: { [key]: 'legacy-runtime-override' } })
    expect((await fetch('/__ai-ready/status', { headers: { authorization: 'Bearer legacy-runtime-override' } })).status).toBe(200)
    expect((await fetch('/__ai-ready/status', { headers: { authorization: `Bearer ${legacy}` } })).status).toBe(401)
  })

  it('prefers the shared root when both keys are configured', async () => {
    const root = 'shared-application-secret-with-32-characters'
    const token = Buffer.from(hkdfSync('sha256', root, 'nuxt', 'nuxt-ai-ready:runtime-sync', 32)).toString('hex')
    await stopServer()
    await startServer({ env: { NUXT_APP_SECRET: root, NUXT_AI_READY_RUNTIME_SYNC_SECRET: legacy } })
    expect((await fetch('/__ai-ready/status', { headers: { authorization: `Bearer ${token}` } })).status).toBe(200)
    expect((await fetch('/__ai-ready/status', { headers: { authorization: `Bearer ${legacy}` } })).status).toBe(401)
  })
})
