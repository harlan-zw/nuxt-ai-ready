import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

export function cloudflareNegotiationSuite(baseURL: string, protectAbout = false, routingSource: 'config' | 'file' = 'config') {
  describe(`cloudflare prerendered page negotiation at ${baseURL}`, async () => {
    await setup({
      rootDir: resolve(routingSource === 'file' ? '../fixtures/cloudflare-external-routing' : '../fixtures/cloudflare'),
      build: true,
      server: false,
      nuxtConfig: {
        app: { baseURL },
        runtimeConfig: {
          cloudflareNegotiationProtectAbout: protectAbout,
          cloudflareNegotiationProtectDocs: routingSource === 'file',
        },
        aiReady: { database: false },
        nitro: {
          compatibilityDate: '2026-10-08',
          cloudflare: {
            deployConfig: true,
            wrangler: {
              name: 'ai-ready-negotiation-test',
              assets: { run_worker_first: ['/_nuxt/*', ...protectAbout && routingSource === 'config' ? [`${baseURL}about*`] : []] },
            },
          },
        },
      },
    })

    const port = 19000 + Math.floor(Math.random() * 1000)
    const origin = `http://127.0.0.1:${port}`
    let worker: ReturnType<typeof spawn>

    beforeAll(async () => {
      const output = join(useTestContext().nuxt!.options.buildDir, 'output')
      worker = spawn('pnpm', ['exec', 'wrangler', 'dev', '--local', '--config', join(output, 'server/wrangler.json'), '--port', String(port), '--show-interactive-dev-session', 'false'], {
        cwd: resolve('../..'),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      })
      await new Promise<void>((resolve, reject) => {
        let logs = ''
        const timeout = setTimeout(() => reject(new Error(`Wrangler did not start: ${logs}`)), 60000)
        const receive = (data: Buffer) => {
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

    it.each(['/', '/about', '/about/'])('negotiates Markdown for static page %s', async (path) => {
      const response = await fetch(`${origin}${baseURL}${path.slice(1)}`, { headers: { Accept: 'text/markdown' } })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/markdown')
      expect(await response.text()).toContain('#')
    })

    it('preserves the static HTML response and advertises its Markdown alternate', async () => {
      const response = await fetch(`${origin}${baseURL}`, { headers: { Accept: 'text/html' } })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      expect(response.headers.get('etag')).toBeTruthy()
      if (baseURL === '/')
        expect(response.headers.get('vary')).toContain('Accept-Encoding')
      expect(response.headers.get('vary')).toContain('Accept')
      expect(response.headers.get('link')).toContain('rel="alternate"; type="text/markdown"')
      expect(await response.text()).toContain('Test Site')
    })

    it('preserves static HEAD responses without rendering a body', async () => {
      const response = await fetch(`${origin}${baseURL}`, { method: 'HEAD', headers: { Accept: 'text/html' } })
      expect(response.status).toBe(200)
      expect(response.headers.get('etag')).toBeTruthy()
      expect(await response.text()).toBe('')
    })

    if (protectAbout) {
      it.each(['/about', '/about/'])('keeps application access checks on existing Worker path %s', async (path) => {
        const response = await fetch(`${origin}${baseURL}${path.slice(1)}`, { headers: { Accept: 'text/html' } })
        expect(response.status).toBe(401)
      })
    }
    if (routingSource === 'file') {
      it('keeps environment-specific Worker paths behind access checks', async () => {
        const response = await fetch(`${origin}${baseURL}docs/api`, { headers: { Accept: 'text/html' } })
        expect(response.status).toBe(401)
      })
    }
  })
}
