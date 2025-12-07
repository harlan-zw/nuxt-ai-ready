import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { useRuntimeConfig } from 'nitropack/runtime'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock nitropack/runtime
vi.mock('nitropack/runtime', () => ({
  defineNitroPlugin: (fn: (app: unknown) => void) => fn,
  useRuntimeConfig: vi.fn(),
}))

describe('sitemap-lastmod plugin', () => {
  let tempDir: string
  let manifestPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sitemap-lastmod-test-'))
    manifestPath = join(tempDir, 'content-hashes.json')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
    vi.resetAllMocks()
  })

  async function loadPlugin() {
    // Clear module cache to get fresh import
    vi.resetModules()
    const mod = await import('../../src/runtime/server/plugins/sitemap-lastmod')
    return mod.default
  }

  it('should apply lastmod from manifest to matching URLs', async () => {
    const manifest = {
      pages: {
        '/': { contentHash: 'abc', updatedAt: '2025-01-01T00:00:00.000Z', firstSeenAt: '2024-01-01T00:00:00.000Z' },
        '/about': { contentHash: 'def', updatedAt: '2025-02-15T12:00:00.000Z', firstSeenAt: '2024-06-01T00:00:00.000Z' },
      },
      version: '1',
    }
    await writeFile(manifestPath, JSON.stringify(manifest))

    vi.mocked(useRuntimeConfig).mockReturnValue({
      'nuxt-ai-ready': { timestampsManifestPath: manifestPath },
    } as any)

    const plugin = await loadPlugin()

    const hooks: Record<string, (ctx: unknown) => Promise<void>> = {}
    const nitroApp = {
      hooks: {
        hook: (name: string, fn: (ctx: unknown) => Promise<void>) => { hooks[name] = fn },
      },
    }

    plugin(nitroApp)

    const ctx = {
      urls: [
        { loc: 'https://example.com/' },
        { loc: 'https://example.com/about' },
        { loc: 'https://example.com/contact' },
      ],
    }

    await hooks['sitemap:resolved'](ctx)

    expect(ctx.urls[0].lastmod).toBe('2025-01-01T00:00:00.000Z')
    expect(ctx.urls[1].lastmod).toBe('2025-02-15T12:00:00.000Z')
    expect(ctx.urls[2].lastmod).toBeUndefined()
  })

  it('should normalize trailing slashes', async () => {
    const manifest = {
      pages: {
        '/docs': { contentHash: 'abc', updatedAt: '2025-03-01T00:00:00.000Z', firstSeenAt: '2025-01-01T00:00:00.000Z' },
      },
      version: '1',
    }
    await writeFile(manifestPath, JSON.stringify(manifest))

    vi.mocked(useRuntimeConfig).mockReturnValue({
      'nuxt-ai-ready': { timestampsManifestPath: manifestPath },
    } as any)

    const plugin = await loadPlugin()

    const hooks: Record<string, (ctx: unknown) => Promise<void>> = {}
    const nitroApp = {
      hooks: {
        hook: (name: string, fn: (ctx: unknown) => Promise<void>) => { hooks[name] = fn },
      },
    }

    plugin(nitroApp)

    const ctx = {
      urls: [
        { loc: 'https://example.com/docs/' }, // trailing slash
      ],
    }

    await hooks['sitemap:resolved'](ctx)

    expect(ctx.urls[0].lastmod).toBe('2025-03-01T00:00:00.000Z')
  })

  it('should not register hook when manifest path not configured', async () => {
    vi.mocked(useRuntimeConfig).mockReturnValue({
      'nuxt-ai-ready': {},
    } as any)

    const plugin = await loadPlugin()

    const hooks: Record<string, (ctx: unknown) => Promise<void>> = {}
    const nitroApp = {
      hooks: {
        hook: (name: string, fn: (ctx: unknown) => Promise<void>) => { hooks[name] = fn },
      },
    }

    plugin(nitroApp)

    expect(hooks['sitemap:resolved']).toBeUndefined()
  })

  it('should handle missing manifest file gracefully', async () => {
    vi.mocked(useRuntimeConfig).mockReturnValue({
      'nuxt-ai-ready': { timestampsManifestPath: '/nonexistent/path.json' },
    } as any)

    const plugin = await loadPlugin()

    const hooks: Record<string, (ctx: unknown) => Promise<void>> = {}
    const nitroApp = {
      hooks: {
        hook: (name: string, fn: (ctx: unknown) => Promise<void>) => { hooks[name] = fn },
      },
    }

    plugin(nitroApp)

    const ctx = {
      urls: [{ loc: '/' }],
    }

    // Should not throw
    await hooks['sitemap:resolved'](ctx)

    expect(ctx.urls[0].lastmod).toBeUndefined()
  })
})
