import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'

const cliPath = resolve(import.meta.dirname, '../../dist/cli.mjs')
const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(done => server.close(() => done()))))
})

async function startSite(broken = false) {
  const requests: string[] = []
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url} ${req.headers.authorization || ''}`)
    const path = req.url
    if (path === '/old') {
      res.writeHead(302, { location: '/docs/about' })
      res.end()
    }
    else if (path === '/docs/about' && req.headers.accept !== 'text/markdown') {
      res.writeHead(200, { 'content-type': 'text/html', 'link': '</docs/about.md>; rel="alternate"; type="text/markdown"' })
      res.end('<html><body><h1>About</h1></body></html>')
    }
    else if (path === '/docs/about' || path === '/docs/about.md') {
      res.writeHead(broken ? 500 : 200, { 'content-type': 'text/markdown', 'vary': 'Accept' })
      res.end('# About\n\nPublic content.')
    }
    else if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`User-agent: *\nAllow: /\nSitemap: http://${req.headers.host}/docs/sitemap.xml`)
    }
    else if (path === '/docs/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml' })
      res.end(`<urlset><url><loc>http://${req.headers.host}/docs/about</loc></url></urlset>`)
    }
    else {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  servers.push(server)
  await new Promise<void>(ready => server.listen(0, '127.0.0.1', ready))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No HTTP server address.')
  return { url: `http://127.0.0.1:${address.port}`, requests }
}

describe('audit CLI', () => {
  it('prints standalone JSON without a project or secret, including redirects and base paths', async () => {
    const site = await startSite()
    const result = await execa(process.execPath, [cliPath, 'audit', `${site.url}/old`, '--base', '/docs/', '--json'], { cwd: tmpdir(), reject: false })
    expect(result.exitCode).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report.checks.find((check: { id: string }) => check.id === 'markdown-url')).toMatchObject({ status: 'pass', url: `${site.url}/docs/about.md` })
    expect(site.requests.every(request => request.startsWith('GET ') && request.endsWith(' '))).toBe(true)
    expect(site.requests.some(request => request.includes('__ai-ready'))).toBe(false)
  })

  it('exits non-zero and retains structured failure results', async () => {
    const site = await startSite(true)
    const result = await execa(process.execPath, [cliPath, 'audit', `${site.url}/docs/about`, '--base', '/docs/', '--json'], { reject: false })
    expect(result.exitCode).toBe(1)
    const report = JSON.parse(result.stdout)
    expect(report.checks.find((check: { id: string }) => check.id === 'markdown-negotiation')).toMatchObject({ status: 'fail', detail: expect.stringContaining('500') })
  })
})
