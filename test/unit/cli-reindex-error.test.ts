import type { Server } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'

const cliPath = resolve(import.meta.dirname, '../../src/cli.ts')

const temporaryDirectories: string[] = []
const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(done => server.close(() => done()))))
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function startReindexStub(status: number, body: unknown): Promise<string> {
  const server = createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  servers.push(server)
  await new Promise<void>(ready => server.listen(0, '127.0.0.1', ready))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return `http://127.0.0.1:${port}`
}

async function writeSecret(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-cli-'))
  temporaryDirectories.push(cwd)
  await mkdir(join(cwd, 'node_modules/.cache/nuxt/ai-ready'), { recursive: true })
  await writeFile(join(cwd, 'node_modules/.cache/nuxt/ai-ready/secret'), 'cli-test-secret\n')
  return cwd
}

function runReindex(url: string, cwd: string, route = '/about', env: Record<string, string> = {}) {
  return execa(process.execPath, [cliPath, 'reindex', route, '--url', url, '--cwd', cwd], { reject: false, env })
}

describe('cli reindex error handling', () => {
  it('reports the h3 error body message and exits non-zero on 400', async () => {
    const url = await startReindexStub(400, {
      url: '/__ai-ready/reindex?route=about',
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Invalid route. It must be an absolute path starting with "/", for example "/about".',
    })
    const cwd = await writeSecret()

    const result = await runReindex(url, cwd)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Invalid route')
    expect(result.stderr).not.toContain('Failed: undefined')
  })

  it('reports the error body message and exits non-zero on 401', async () => {
    const url = await startReindexStub(401, { statusCode: 401, message: 'Unauthorized' })
    const cwd = await writeSecret()

    const result = await runReindex(url, cwd)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Unauthorized')
  })

  it('maps the 502 route error body and exits non-zero', async () => {
    const url = await startReindexStub(502, { route: '/about', indexed: false, error: 'Failed to index /about' })
    const cwd = await writeSecret()

    const result = await runReindex(url, cwd)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Failed to index /about')
  })

  it('prints the indexed route and exits 0 on success', async () => {
    const url = await startReindexStub(200, { route: '/about', indexed: true, contentChanged: true })
    const cwd = await writeSecret()

    const result = await runReindex(url, cwd, '/about', { CONSOLA_LEVEL: '3' })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Indexed')
    expect(result.stdout).toContain('/about')
    expect(result.stderr).not.toContain('Failed')
  })
})
