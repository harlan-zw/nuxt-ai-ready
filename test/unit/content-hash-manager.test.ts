import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createContentHashManager } from '../../src/content-hash-manager'

describe('content-hash-manager', () => {
  let tempDir: string
  let storagePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-test-'))
    storagePath = join(tempDir, 'content-hashes.json')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should hash content consistently', () => {
    const manager = createContentHashManager({ storagePath })
    const content = 'Hello, World!'
    const hash1 = manager.hashContent(content)
    const hash2 = manager.hashContent(content)
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // SHA256 produces 64 hex chars
  })

  it('should produce different hashes for different content', () => {
    const manager = createContentHashManager({ storagePath })
    const hash1 = manager.hashContent('Content A')
    const hash2 = manager.hashContent('Content B')
    expect(hash1).not.toBe(hash2)
  })

  it('should create new page with timestamps on first encounter', async () => {
    const manager = createContentHashManager({ storagePath })
    const manifest = await manager.getManifest()
    const timestamp = manager.updatePageHash('/test', 'Content', manifest)

    expect(timestamp.contentHash).toBeTruthy()
    expect(timestamp.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/) // ISO 8601 format
    expect(timestamp.firstSeenAt).toBe(timestamp.updatedAt) // First time, both equal
  })

  it('should preserve timestamps when content unchanged', async () => {
    const manager = createContentHashManager({ storagePath })
    const manifest1 = await manager.getManifest()

    // First update
    const timestamp1 = manager.updatePageHash('/test', 'Content', manifest1)
    await manager.saveManifest()

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 10))

    // Second update with same content
    const manifest2 = await manager.getManifest()
    const timestamp2 = manager.updatePageHash('/test', 'Content', manifest2)

    expect(timestamp2.contentHash).toBe(timestamp1.contentHash)
    expect(timestamp2.updatedAt).toBe(timestamp1.updatedAt) // Unchanged
    expect(timestamp2.firstSeenAt).toBe(timestamp1.firstSeenAt) // Unchanged
  })

  it('should update timestamp when content changes', async () => {
    const manager = createContentHashManager({ storagePath })
    const manifest1 = await manager.getManifest()

    // First update
    const timestamp1 = manager.updatePageHash('/test', 'Content A', manifest1)
    await manager.saveManifest()

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 10))

    // Second update with different content
    const manifest2 = await manager.getManifest()
    const timestamp2 = manager.updatePageHash('/test', 'Content B', manifest2)

    expect(timestamp2.contentHash).not.toBe(timestamp1.contentHash)
    expect(timestamp2.updatedAt).not.toBe(timestamp1.updatedAt) // Updated
    expect(timestamp2.firstSeenAt).toBe(timestamp1.firstSeenAt) // Preserved
  })

  it('should persist and load manifest', async () => {
    const manager1 = createContentHashManager({ storagePath })
    const manifest1 = await manager1.getManifest()

    manager1.updatePageHash('/page1', 'Content 1', manifest1)
    manager1.updatePageHash('/page2', 'Content 2', manifest1)
    await manager1.saveManifest()

    // Create new manager instance
    const manager2 = createContentHashManager({ storagePath })
    const manifest2 = await manager2.getManifest()

    expect(Object.keys(manifest2.pages)).toHaveLength(2)
    expect(manifest2.pages['/page1']).toBeTruthy()
    expect(manifest2.pages['/page2']).toBeTruthy()
  })

  it('should handle empty manifest on first load', async () => {
    const manager = createContentHashManager({ storagePath })
    const manifest = await manager.getManifest()

    expect(manifest.pages).toEqual({})
    expect(manifest.version).toBe('1')
  })

  it('should track multiple pages independently', async () => {
    const manager = createContentHashManager({ storagePath })
    const manifest = await manager.getManifest()

    const ts1 = manager.updatePageHash('/page1', 'Content 1', manifest)
    const ts2 = manager.updatePageHash('/page2', 'Content 2', manifest)

    expect(ts1.contentHash).not.toBe(ts2.contentHash)
    expect(manifest.pages['/page1']).toBeTruthy()
    expect(manifest.pages['/page2']).toBeTruthy()
  })

  it('should allow setting manual timestamps via setPageTimestamp', async () => {
    const manager = createContentHashManager({ storagePath })
    const manifest = await manager.getManifest()

    const manualTimestamp = '2024-01-15T10:30:00.000Z'
    manager.setPageTimestamp('/page', 'Content', manualTimestamp, manifest)

    expect(manifest.pages['/page']?.updatedAt).toBe(manualTimestamp)
    expect(manifest.pages['/page']?.firstSeenAt).toBe(manualTimestamp)
    expect(manifest.pages['/page']?.contentHash).toBeTruthy()
  })

  it('should preserve firstSeenAt when setting manual timestamp on existing page', async () => {
    const manager = createContentHashManager({ storagePath })
    const manifest1 = await manager.getManifest()

    // First update with automatic timestamp
    const auto = manager.updatePageHash('/page', 'Content', manifest1)
    await manager.saveManifest()

    // Second update with manual timestamp
    const manifest2 = await manager.getManifest()
    const manualTimestamp = '2025-01-01T00:00:00.000Z'
    manager.setPageTimestamp('/page', 'Content', manualTimestamp, manifest2)

    expect(manifest2.pages['/page']?.updatedAt).toBe(manualTimestamp)
    expect(manifest2.pages['/page']?.firstSeenAt).toBe(auto.firstSeenAt) // Preserved
  })
})
