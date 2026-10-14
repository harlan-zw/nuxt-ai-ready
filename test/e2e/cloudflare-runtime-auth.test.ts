import { spawn } from 'node:child_process'
import { hkdfSync } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = 'cloudflare-runtime-only-secret-32-characters'
const token = Buffer.from(hkdfSync('sha256', root, 'nuxt', 'nuxt-ai-ready:runtime-sync', 32)).toString('hex')

describe('cloudflare runtime-only application secret', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/cloudflare', import.meta.url)),
    build: true,
    server: false,
    nuxtConfig: {
      runtimeConfig: { appSecret: '' },
      aiReady: { runtimeSync: true },
      nitro: {
        preset: 'cloudflare-module',
        compatibilityDate: '2026-10-08',
        cloudflare: { deployConfig: true, wrangler: { name: 'ai-ready-runtime-auth-test' } },
      },
    },
  })

  const port = 20000 + Math.floor(Math.random() * 1000)
  const origin = `http://127.0.0.1:${port}`
  let worker: ReturnType<typeof spawn>

  beforeAll(async () => {
    const output = join(useTestContext().nuxt!.options.buildDir, 'output')
    await writeFile(join(output, 'server/.dev.vars'), `NUXT_APP_SECRET=${root}\n`, { mode: 0o600 })
    worker = spawn('pnpm', [
      'exec',
      'wrangler',
      'dev',
      '--local',
      '--config',
      join(output, 'server/wrangler.json'),
      '--port',
      String(port),
      '--show-interactive-dev-session',
      'false',
    ], { cwd: fileURLToPath(new URL('../..', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'], detached: true })

    await new Promise<void>((resolve, reject) => {
      let logs = ''
      const timeout = setTimeout(() => reject(new Error(`Wrangler did not start: ${logs}`)), 60000)
      function receive(data: Buffer) {
        logs += data.toString()
        if (logs.includes('Ready on')) {
          clearTimeout(timeout)
          resolve()
        }
      }
      worker.stdout!.on('data', receive)
      worker.stderr!.on('data', receive)
      worker.once('exit', (code) => {
        clearTimeout(timeout)
        reject(new Error(`Wrangler exited ${code}: ${logs}`))
      })
    })
  }, 70000)

  afterAll(async () => {
    if (!worker?.pid || worker.exitCode !== null)
      return
    const exited = new Promise<void>(resolve => worker.once('exit', () => resolve()))
    process.kill(-worker.pid, 'SIGTERM')
    await exited
  })

  it('authenticates using the request binding without a build secret', async () => {
    // An authenticated request reaches route validation before any D1 query.
    const response = await fetch(`${origin}/__ai-ready/reindex`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ message: expect.stringContaining('Invalid route') })
  })

  it.each([undefined, root])('rejects an invalid bearer token: %s', async (bearer) => {
    const response = await fetch(`${origin}/__ai-ready/reindex`, {
      method: 'POST',
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    })
    expect(response.status).toBe(401)
  })
})
