import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

export function cloudflareStaticLinksSuite(baseURL: string, discovery = true) {
  describe(`static Cloudflare discovery at ${baseURL}`, async () => {
    await setup({
      rootDir: resolve('../fixtures/cloudflare-static-links'),
      server: false,
      build: true,
      nuxtConfig: {
        app: { baseURL },
        ...discovery ? {} : { aiReady: { apiCatalog: false, describedby: false } },
        nitro: {
          compatibilityDate: '2026-10-08',
          cloudflare: { deployConfig: true, wrangler: { name: 'static-links-test' } },
        },
      },
    })
    const port = 19000 + Math.floor(Math.random() * 1000)
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
      if (!worker?.pid || worker.exitCode !== null || worker.signalCode !== null)
        return
      const exited = new Promise<void>(resolve => worker.once('exit', () => resolve()))
      process.kill(-worker.pid, 'SIGTERM')
      await exited
    })
    it.each(['/', '/about'])('advertises discovery on asset-served HTML %s', async (path) => {
      const response = await fetch(`http://127.0.0.1:${port}${baseURL}${path.slice(1)}`, { headers: { Accept: 'text/markdown' } })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      expect(response.headers.get('etag')).toBeTruthy()
      if (discovery) {
        expect(response.headers.get('link')).toContain(`<${baseURL}llms.txt>; rel="describedby"`)
        expect(response.headers.get('link')?.match(/rel="api-catalog"/g)).toHaveLength(1)
      }
      else {
        expect(response.headers.get('link')).not.toContain('rel="describedby"')
        expect(response.headers.get('link')).not.toContain('rel="api-catalog"')
      }
      expect(response.headers.get('link')).toContain('</styles.css>; rel="preload"; as="style"')
      expect(response.headers.get('x-discovery-test')).toBe('preserved')
      expect(response.headers.get('x-frame-options')).toBe('DENY')
    })
  })
}
