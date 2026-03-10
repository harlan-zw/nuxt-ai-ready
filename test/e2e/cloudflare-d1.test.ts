import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const fixtureDir = resolve('../fixtures/cloudflare')

const RE_MD_H1 = /^# /

// cloudflare-module preset doesn't work with wrangler dev locally
// (requires __STATIC_CONTENT_MANIFEST which is only available in deployed workers)
// This test is skipped - use cloudflare-pages preset for local wrangler testing
describe.skip('cloudflare D1 runtime', async () => {
  let wranglerProcess: ChildProcess | null = null
  let baseUrl: string
  let symlinkCreated = false

  // First build the fixture
  await setup({
    server: false,
    build: true,
    fixture: fixtureDir,
  })

  beforeAll(async () => {
    // Symlink test output to .output so wrangler can find it
    const ctx = useTestContext()
    const actualOutput = join(ctx.nuxt!.options.buildDir, 'output')
    const expectedOutput = join(fixtureDir, '.output')

    // Remove existing .output if it exists, then symlink
    await rm(expectedOutput, { recursive: true, force: true })
    await symlink(actualOutput, expectedOutput)
    symlinkCreated = true

    // Find a free port
    const port = 8700 + Math.floor(Math.random() * 100)
    baseUrl = `http://localhost:${port}`

    // Run wrangler dev from fixture directory (reads wrangler.toml automatically)
    wranglerProcess = spawn('npx', [
      'wrangler',
      'dev',
      '--port',
      String(port),
      '--persist-to',
      '.wrangler',
    ], {
      cwd: fixtureDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_D1_WARNING: 'true' },
    })

    // Collect output for debugging
    let stdout = ''
    let stderr = ''

    // Wait for wrangler to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('Wrangler stdout:', stdout)
        console.error('Wrangler stderr:', stderr)
        reject(new Error('Wrangler startup timeout'))
      }, 30000)

      wranglerProcess!.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        stdout += output
        if (output.includes('Ready on')) {
          clearTimeout(timeout)
          resolve()
        }
      })

      wranglerProcess!.stderr?.on('data', (data: Buffer) => {
        const output = data.toString()
        stderr += output
      })

      wranglerProcess!.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })

      wranglerProcess!.on('exit', (code) => {
        if (code !== null && code !== 0) {
          clearTimeout(timeout)
          console.error('Wrangler stdout:', stdout)
          console.error('Wrangler stderr:', stderr)
          reject(new Error(`Wrangler exited with code ${code}`))
        }
      })
    })

    // Additional wait for stability
    await new Promise(r => setTimeout(r, 500))
  }, 60000)

  afterAll(async () => {
    wranglerProcess?.kill()
    // Clean up symlink
    if (symlinkCreated) {
      await rm(join(fixtureDir, '.output'), { force: true })
    }
  })

  it('serves llms.txt from D1-backed runtime', async () => {
    const response = await fetch(`${baseUrl}/llms.txt`)
    expect(response.ok).toBe(true)

    const text = await response.text()
    expect(text).toMatch(RE_MD_H1)
    expect(text).toContain('Test Site')
  })

  it('restores page data from dump on cold start', async () => {
    // The llms.txt should contain prerendered pages
    const response = await fetch(`${baseUrl}/llms.txt`)
    const text = await response.text()

    // Should have page entries from prerender
    expect(text).toContain('Welcome to Test Site')
    expect(text).toContain('About')
  })

  it('serves llms-full.txt with markdown content', async () => {
    const response = await fetch(`${baseUrl}/llms-full.txt`)
    expect(response.ok).toBe(true)

    const text = await response.text()
    expect(text).toContain('#') // Has markdown
    expect(text.length).toBeGreaterThan(100)
  })

  it('serves markdown for pages', async () => {
    const response = await fetch(`${baseUrl}/about.md`)
    expect(response.ok).toBe(true)

    const text = await response.text()
    expect(text).toContain('#')
  })
})
