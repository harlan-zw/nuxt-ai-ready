import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { verifyErrorRepresentations } from './test-errors.ts'

const cli = spawnSync(process.execPath, ['node_modules/nuxt-ai-ready-packed/dist/cli.mjs', '--version'], {
  cwd: import.meta.dirname,
  encoding: 'utf8',
})
assert.equal(cli.status, 0, cli.stderr)
assert.equal(cli.stdout.trim(), '3.0.0')

const portServer = createServer()
portServer.listen(0, '127.0.0.1')
await once(portServer, 'listening')
const port = portServer.address().port
portServer.close()
await once(portServer, 'close')

const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: import.meta.dirname,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    NITRO_PORT: String(port),
    NITRO_HOST: '127.0.0.1',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
})

let output = ''
server.stdout.setEncoding('utf8')
server.stdout.on('data', chunk => output += chunk)

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const match = output.match(/Listening on:?\s*(http:\/\/[^/\s]+)\/?/)
    if (match)
      return match[1]
    if (server.exitCode !== null)
      throw new Error(`Nuxt 5 server exited with code ${server.exitCode}`)
    await delay(50)
  }
  throw new Error('Timed out waiting for Nuxt 5 server')
}

try {
  const origin = await waitForServer()
  await verifyErrorRepresentations(origin)
  const response = await fetch(`${origin}/api/compat`)
  if (!response.ok)
    throw new Error(`Compatibility endpoint returned ${response.status}`)
  const result = await response.json()
  if (result.marker !== 'nuxt-5')
    throw new Error(`Unexpected compatibility marker: ${JSON.stringify(result)}`)
  if (result.requestContextMarker !== 'nuxt-5-context')
    throw new Error(`Unexpected request context marker: ${JSON.stringify(result)}`)
  assert.ok(result.pageCount >= 1, 'The server alias queries indexed SQLite pages')
  assert.equal(result.pageCountAfterNested, result.pageCount)
  const lifecycle = await fetch(`${origin}/api/database-lifecycle`).then(response => response.json())
  assert.equal(lifecycle.isOpen, false, 'The raw parent afterResponse hook closes its native SQLite driver')
  const deferred = await fetch(`${origin}/api/database-deferred`).then(response => response.json())
  const pending = await fetch(`${origin}/api/database-lifecycle`).then(response => response.json())
  assert.equal(pending.isOpen, true, 'Deferred work keeps the native database open after the response')
  const completed = await fetch(`${origin}/api/database-deferred-release`).then(response => response.json())
  assert.equal(completed.pageCount, deferred.pageCount)
  assert.equal(completed.isOpen, false, 'The final deferred query closes its owned database')
  const borrowedDeferred = await fetch(`${origin}/api/database-borrowed-deferred`).then(response => response.json())
  const borrowedPending = await fetch(`${origin}/api/database-lifecycle`).then(response => response.json())
  assert.equal(borrowedPending.isOpen, true, 'Borrowed deferred work keeps its owner database open')
  const borrowedCompleted = await fetch(`${origin}/api/database-deferred-release`).then(response => response.json())
  assert.equal(borrowedCompleted.pageCount, borrowedDeferred.pageCount)
  assert.equal(borrowedCompleted.isOpen, false, 'The borrowed task cleans up its owner database')
  const successHeader = await fetch(`${origin}/api/status-header`)
  assert.equal(successHeader.headers.get('link'), '<https://example.com/success>; rel="alternate"')
  const failureHeader = await fetch(`${origin}/api/status-header?failure=true`)
  assert.equal(failureHeader.status, 503)
  assert.equal(failureHeader.headers.get('link'), '<https://example.com/safe>; rel="canonical"')
  const renderedError = await fetch(`${origin}/api/status-header?throw=true`, { headers: { accept: 'text/html' } })
  assert.equal(renderedError.status, 503)
  assert.equal(renderedError.headers.get('link'), '<https://example.com/safe>; rel="canonical"')
  const notFoundError = await fetch(`${origin}/api/status-header?throw=404`, { headers: { accept: 'text/html' } })
  assert.equal(notFoundError.status, 404)
  assert.equal(notFoundError.headers.get('link'), '<https://example.com/safe>; rel="canonical"')
  const html = await fetch(origin).then(response => response.text())
  assert.match(html, /id="alias-app">false</)

  const markdownResponse = await fetch(`${origin}/index.md`)
  if (!markdownResponse.ok)
    throw new Error(`Markdown endpoint returned ${markdownResponse.status}`)
  const markdown = await markdownResponse.text()
  if (!markdown.includes('# Nuxt 5 compatibility'))
    throw new Error(`Unexpected markdown response: ${markdown}`)

  const negotiatedResponse = await fetch(`${origin}/prebuilt`, {
    headers: { accept: 'text/markdown' },
    redirect: 'manual',
  })
  if (negotiatedResponse.status !== 307)
    throw new Error(`Negotiated Markdown returned ${negotiatedResponse.status}`)
  if (negotiatedResponse.headers.get('location') !== '/prebuilt.md')
    throw new Error(`Unexpected Markdown redirect: ${negotiatedResponse.headers.get('location')}`)

  const llmsResponse = await fetch(`${origin}/llms.txt`)
  if (!llmsResponse.ok || !(await llmsResponse.text()).includes('https://nuxt5.example.com'))
    throw new Error('The packed module did not produce llms.txt with the configured site URL')
  const robotsResponse = await fetch(`${origin}/robots.txt`)
  if (!robotsResponse.ok || !(await robotsResponse.text()).includes('User-agent:'))
    throw new Error('The installed Robots module did not produce robots.txt')
}
finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit')
    server.kill('SIGTERM')
    await exited
  }
}
