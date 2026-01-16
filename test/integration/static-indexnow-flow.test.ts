/**
 * Integration test for static IndexNow flow
 *
 * This test verifies the full IndexNow submission flow for static sites:
 * 1. First build: no previous meta → skip IndexNow
 * 2. Second build with changes: detect changes → submit to IndexNow
 *
 * Uses a mock IndexNow server to verify the actual HTTP requests.
 */
import type { Server } from 'node:http'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(__dirname, '../fixtures/basic')
const pagesLayerDir = join(__dirname, '../fixtures/.pages-layer')

interface IndexNowRequest {
  host: string
  key: string
  keyLocation: string
  urlList: string[]
}

describe('static IndexNow flow (integration)', () => {
  let tempDir: string
  let mockIndexNowServer: Server
  let staticServer: Server
  let mockServerPort: number
  let staticServerPort: number
  let indexNowRequests: IndexNowRequest[] = []

  // Mutable state for controlling static server behavior
  const serverState = {
    servePagesMeta: false,
    savedPagesMeta: null as string | null,
  }

  beforeAll(async () => {
    // Create temp directory
    tempDir = join(__dirname, '../../.temp-test', `static-indexnow-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })

    // Copy fixture to temp dir
    await cp(fixtureDir, tempDir, { recursive: true })
    await cp(pagesLayerDir, join(tempDir, '../.pages-layer'), { recursive: true })

    // Create mock IndexNow server
    mockIndexNowServer = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/indexnow') {
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', () => {
          const parsed = JSON.parse(body) as IndexNowRequest
          indexNowRequests.push(parsed)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{}')
        })
      }
      else {
        res.writeHead(404)
        res.end()
      }
    })

    // Start mock server on random port
    await new Promise<void>((resolve) => {
      mockIndexNowServer.listen(0, '127.0.0.1', () => {
        const addr = mockIndexNowServer.address()
        mockServerPort = typeof addr === 'object' ? addr!.port : 0
        resolve()
      })
    })

    // Create static file server for serving first build output
    staticServer = createServer(async (req, res) => {
      console.log(`[static-server] ${req.method} ${req.url}`)
      const distDir = join(tempDir, '.output/public')
      let filePath = join(distDir, req.url || '/')

      // Handle IndexNow key file specially (it's a dynamic route, not prerendered)
      if (req.url === '/test-key-123.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('test-key-123')
        return
      }

      // Control serving pages.meta.json (simulate first deploy vs subsequent)
      if (req.url === '/__ai-ready/pages.meta.json') {
        if (!serverState.servePagesMeta || !serverState.savedPagesMeta) {
          console.log('[static-server] Blocking pages.meta.json (not enabled or no saved content)')
          res.writeHead(404)
          res.end()
          return
        }
        // Serve cached content (simulates live site with stable deployed content)
        console.log('[static-server] Serving cached pages.meta.json:', serverState.savedPagesMeta.slice(0, 200))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(serverState.savedPagesMeta)
        return
      }

      // Handle directory requests
      if (filePath.endsWith('/')) {
        filePath = join(filePath, 'index.html')
      }

      const content = await readFile(filePath).catch(() => null)
      if (content) {
        const ext = filePath.split('.').pop()
        const contentType = ext === 'json' ? 'application/json' : 'text/plain'
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(content)
      }
      else {
        res.writeHead(404)
        res.end()
      }
    })

    await new Promise<void>((resolve) => {
      staticServer.listen(0, '127.0.0.1', () => {
        const addr = staticServer.address()
        staticServerPort = typeof addr === 'object' ? addr!.port : 0
        resolve()
      })
    })
  }, 60000)

  afterAll(async () => {
    mockIndexNowServer?.close()
    staticServer?.close()
    // Clean up temp dir
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    await rm(join(tempDir, '../.pages-layer'), { recursive: true, force: true }).catch(() => {})
  })

  it('first build skips IndexNow (no previous meta)', async () => {
    // Update nuxt.config to use our mock server and static server URL
    const configPath = join(tempDir, 'nuxt.config.ts')
    const staticUrl = `http://127.0.0.1:${staticServerPort}`

    await writeFile(configPath, `
export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: ['/', '/about'],
      failOnError: false,
    },
  },
  site: {
    url: '${staticUrl}',
    name: 'Test Site',
  },
  aiReady: {
    indexNowKey: 'test-key-123',
  },
})
`)

    // Clear previous requests
    indexNowRequests = []

    // Run first build
    console.log('Running first build in:', tempDir)
    const firstBuild = await execa('npx', ['nuxi', 'generate'], {
      cwd: tempDir,
      env: {
        ...process.env,
      },
      reject: false,
    })

    console.log('First build stdout:', firstBuild.stdout)
    console.log('First build stderr:', firstBuild.stderr)
    console.log('First build exit code:', firstBuild.exitCode)

    if (firstBuild.exitCode !== 0) {
      throw new Error(`First build failed with exit code ${firstBuild.exitCode}`)
    }

    // Check if dist was created
    const distDir = join(tempDir, '.output/public')
    const distExists = await readFile(join(distDir, 'index.html'), 'utf-8').catch(() => null)
    console.log('Dist index.html exists:', !!distExists)

    // Verify pages.meta.json was created
    const metaPath = join(tempDir, '.output/public/__ai-ready/pages.meta.json')
    const meta = JSON.parse(await readFile(metaPath, 'utf-8'))

    expect(meta.buildId).toBeDefined()
    expect(meta.pages).toBeInstanceOf(Array)
    expect(meta.pages.length).toBeGreaterThan(0)

    // No IndexNow requests on first build (no previous meta to compare)
    expect(indexNowRequests).toHaveLength(0)

    // Save first build's pages.meta.json for subsequent builds (simulates live site)
    serverState.savedPagesMeta = await readFile(metaPath, 'utf-8')
    serverState.servePagesMeta = true
    console.log('Saved pages.meta.json for subsequent builds:', serverState.savedPagesMeta.slice(0, 200))
  }, 120000)

  it('second build with changes submits to IndexNow', async () => {
    // Modify a page to create a content change
    const aboutPagePath = join(tempDir, '../.pages-layer/app/pages/about.vue')
    const originalContent = await readFile(aboutPagePath, 'utf-8')
    const modifiedContent = originalContent.replace(
      'This test site demonstrates',
      'MODIFIED CONTENT: This test site demonstrates',
    )
    await writeFile(aboutPagePath, modifiedContent)

    // Clear previous requests
    indexNowRequests = []

    // Clear Nuxt build cache to ensure fresh compilation
    await rm(join(tempDir, 'node_modules/.cache/nuxt'), { recursive: true, force: true }).catch(() => {})
    await rm(join(tempDir, '.nuxt'), { recursive: true, force: true }).catch(() => {})

    try {
      // Run second build with test endpoint override
      console.log('Running second build with INDEXNOW_TEST_ENDPOINT:', `http://127.0.0.1:${mockServerPort}/indexnow`)
      const secondBuild = await execa('npx', ['nuxi', 'generate'], {
        cwd: tempDir,
        env: {
          ...process.env,
          INDEXNOW_TEST_ENDPOINT: `http://127.0.0.1:${mockServerPort}/indexnow`,
        },
        reject: false,
      })

      console.log('Second build stdout:', secondBuild.stdout)
      console.log('Second build stderr:', secondBuild.stderr)
      console.log('Second build exit code:', secondBuild.exitCode)
      console.log('IndexNow requests received:', indexNowRequests.length)

      if (secondBuild.exitCode !== 0) {
        throw new Error(`Second build failed with exit code ${secondBuild.exitCode}`)
      }

      // Verify IndexNow was called with the changed page
      expect(indexNowRequests.length).toBeGreaterThan(0)

      const request = indexNowRequests[0]
      expect(request?.key).toBe('test-key-123')
      expect(request?.urlList).toContain(`http://127.0.0.1:${staticServerPort}/about`)
    }
    finally {
      // Restore original page content
      await writeFile(aboutPagePath, originalContent)
    }
  }, 180000)

  it('build with no changes skips IndexNow', async () => {
    // Clear previous requests
    indexNowRequests = []

    // Run build again without changes
    await execa('npx', ['nuxi', 'generate'], {
      cwd: tempDir,
    })

    // No IndexNow requests when content hasn't changed
    expect(indexNowRequests).toHaveLength(0)
  }, 120000)
})
