import type { Storage } from 'unstorage'
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import { logger } from './logger'

export interface ContentHashManifest {
  pages: Record<string, {
    contentHash: string
    updatedAt: string
    firstSeenAt: string
  }>
  version: string
}

export interface ContentHashManagerOptions {
  storagePath: string
  debug?: boolean
}

export interface PageTimestamp {
  contentHash: string
  updatedAt: string
  firstSeenAt: string
}

export function createContentHashManager(options: ContentHashManagerOptions) {
  const { storagePath, debug = false } = options
  let storage: Storage
  let manifest: ContentHashManifest = {
    pages: {},
    version: '1',
  }

  async function initStorage() {
    await mkdir(dirname(storagePath), { recursive: true })
    storage = createStorage({
      driver: fsDriver({ base: dirname(storagePath) }),
    })
  }

  function hashContent(markdown: string): string {
    return createHash('sha256').update(markdown).digest('hex')
  }

  async function getManifest(): Promise<ContentHashManifest> {
    if (!storage) {
      await initStorage()
    }

    const stored = await storage.getItem<ContentHashManifest>('content-hashes.json')
    if (stored) {
      manifest = stored
      if (debug) {
        logger.debug(`Loaded manifest with ${Object.keys(manifest.pages).length} pages`)
      }
    }
    else {
      if (debug) {
        logger.debug('No existing manifest found, starting fresh')
      }
    }

    return manifest
  }

  async function saveManifest(): Promise<void> {
    if (!storage) {
      await initStorage()
    }

    await storage.setItem('content-hashes.json', manifest)

    if (debug) {
      logger.debug(`Saved manifest with ${Object.keys(manifest.pages).length} pages`)
    }
  }

  function updatePageHash(
    route: string,
    markdown: string,
    previousManifest: ContentHashManifest,
  ): PageTimestamp {
    const contentHash = hashContent(markdown)
    const now = new Date().toISOString()
    const existing = previousManifest.pages[route]

    let result: PageTimestamp

    if (!existing) {
      // New page
      result = {
        contentHash,
        updatedAt: now,
        firstSeenAt: now,
      }
      if (debug) {
        logger.debug(`New page detected: ${route}`)
      }
    }
    else if (existing.contentHash !== contentHash) {
      // Content changed
      result = {
        contentHash,
        updatedAt: now,
        firstSeenAt: existing.firstSeenAt,
      }
      if (debug) {
        logger.debug(`Content changed: ${route}`)
      }
    }
    else {
      // Content unchanged
      result = {
        contentHash: existing.contentHash,
        updatedAt: existing.updatedAt,
        firstSeenAt: existing.firstSeenAt,
      }
      if (debug) {
        logger.debug(`Content unchanged: ${route}`)
      }
    }

    // Update manifest
    manifest.pages[route] = result

    return result
  }

  function setPageTimestamp(
    route: string,
    markdown: string,
    timestamp: string,
    previousManifest: ContentHashManifest,
  ): void {
    const contentHash = hashContent(markdown)
    const existing = previousManifest.pages[route]

    // Store with manual timestamp, preserve firstSeenAt
    manifest.pages[route] = {
      contentHash,
      updatedAt: timestamp,
      firstSeenAt: existing?.firstSeenAt || timestamp,
    }

    if (debug) {
      logger.debug(`Manual timestamp set for ${route}: ${timestamp}`)
    }
  }

  return {
    getManifest,
    saveManifest,
    hashContent,
    updatePageHash,
    setPageTimestamp,
  }
}
