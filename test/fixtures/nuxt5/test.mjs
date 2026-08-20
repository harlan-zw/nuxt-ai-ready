import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: import.meta.dirname,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
})

let output = ''
server.stdout.setEncoding('utf8')
server.stdout.on('data', chunk => output += chunk)

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const match = output.match(/Listening on: (http:\/\/[^/]+)\//)
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
  const response = await fetch(`${origin}/api/compat`)
  if (!response.ok)
    throw new Error(`Compatibility endpoint returned ${response.status}`)
  const result = await response.json()
  if (result.marker !== 'nuxt-5')
    throw new Error(`Unexpected compatibility marker: ${JSON.stringify(result)}`)
  if (result.requestContextMarker !== 'nuxt-5-context')
    throw new Error(`Unexpected request context marker: ${JSON.stringify(result)}`)

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
}
finally {
  server.kill('SIGTERM')
  await new Promise(resolve => server.once('exit', resolve))
}
