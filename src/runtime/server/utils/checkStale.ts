import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { DumpRow } from '../db/shared'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../db'
import { countPages } from '../db/queries'
import { decompressFromBase64, importDbDump } from '../db/shared'
import { logger } from '../logger'
import { fetchPublicAsset } from './fetchPublicAsset'

export interface BuildMeta {
  buildId: string
  pageCount: number
  createdAt: string
}

export interface StaleCheckResult {
  action: 'none' | 'restored' | 'marked_pending'
  buildId?: string
  dbCount: number
  dumpCount?: number
  reason?: string
  /** Number of pages marked pending due to hash change */
  changedCount?: number
  /** Number of new pages added from dump */
  addedCount?: number
}

/**
 * Fetch build metadata from static assets
 */
async function fetchBuildMeta(event?: H3Event): Promise<BuildMeta | null> {
  logger.debug('[stale-check] Fetching meta...')
  return fetchPublicAsset<BuildMeta>(event, '/__ai-ready/pages.meta.json')
}

/**
 * Fetch and decompress dump data
 */
async function fetchDump(event?: H3Event): Promise<DumpRow[] | null> {
  logger.debug('[stale-check] Fetching dump...')
  const dumpData = await fetchPublicAsset<string>(event, '/__ai-ready/pages.dump', { responseType: 'text' })

  if (!dumpData) {
    logger.debug('[stale-check] Failed to fetch dump')
    return null
  }

  logger.debug(`[stale-check] Decompressing dump (${(dumpData.length / 1024).toFixed(1)}kb)...`)
  return decompressFromBase64<DumpRow[]>(dumpData)
}

/**
 * Get stored build ID from database
 */
async function getStoredBuildId(event?: H3Event): Promise<string | null> {
  const db = await useDatabase(event)
  const row = await db.first<{ value: string }>('SELECT value FROM _ai_ready_info WHERE id = ?', ['build_id'])
  return row?.value || null
}

/**
 * Set stored build ID in database
 */
async function setStoredBuildId(event: H3Event | undefined, buildId: string): Promise<void> {
  const db = await useDatabase(event)
  await db.exec('INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)', ['build_id', buildId])
}

/**
 * Get content hashes for all pages in DB
 */
async function getDbContentHashes(event?: H3Event): Promise<Map<string, string | null>> {
  const db = await useDatabase(event)
  const rows = await db.all<{ route: string, content_hash: string | null }>(
    'SELECT route, content_hash FROM ai_ready_pages',
  )
  return new Map(rows.map(r => [r.route, r.content_hash]))
}

/**
 * Mark specific routes as pending
 */
async function markRoutesPending(event: H3Event | undefined, routes: string[]): Promise<void> {
  if (routes.length === 0)
    return
  const db = await useDatabase(event)
  const placeholders = routes.map(() => '?').join(',')
  await db.exec(`UPDATE ai_ready_pages SET indexed = 0 WHERE route IN (${placeholders})`, routes)
}

/**
 * Insert new pages from dump (as already indexed since dump has full content)
 */
async function insertFromDump(event: H3Event | undefined, rows: DumpRow[]): Promise<void> {
  if (rows.length === 0)
    return
  const db = await useDatabase(event)
  const { importDbDump } = await import('../db/shared')
  await importDbDump(db, rows)
}

/**
 * Check if data is stale and handle restore/mark-pending
 * Called at start of cron - handles:
 * 1. Empty DB → restore from dump
 * 2. Build ID changed → compare hashes, only mark changed pages pending, add new pages from dump
 */
export async function checkAndHandleStale(event?: H3Event): Promise<StaleCheckResult> {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const debug = config.debug

  const dbCount = await countPages(event)
  const storedBuildId = await getStoredBuildId(event)
  const meta = await fetchBuildMeta(event)

  if (debug) {
    logger.info(`[stale-check] DB count: ${dbCount}, stored buildId: ${storedBuildId || 'none'}, dump buildId: ${meta?.buildId || 'none'}`)
  }

  // No dump available - nothing to do
  if (!meta) {
    if (debug)
      logger.info('[stale-check] No build metadata found, skipping stale check')
    return { action: 'none', dbCount, reason: 'no_dump_metadata' }
  }

  // Case 1: DB is empty - restore from dump
  if (dbCount === 0) {
    if (debug)
      logger.info('[stale-check] DB empty, restoring from dump...')

    const rows = await fetchDump(event)
    if (!rows) {
      logger.warn('[stale-check] Failed to fetch dump for restore')
      return { action: 'none', dbCount: 0, dumpCount: meta.pageCount, reason: 'dump_fetch_failed' }
    }

    const db = await useDatabase(event)
    await importDbDump(db, rows)
    await setStoredBuildId(event, meta.buildId)

    logger.info(`[stale-check] Restored ${rows.length} pages from dump (buildId: ${meta.buildId})`)
    return {
      action: 'restored',
      buildId: meta.buildId,
      dbCount: rows.length,
      dumpCount: meta.pageCount,
    }
  }

  // Case 2: Build ID changed - compare hashes and only mark changed pages pending
  if (storedBuildId !== meta.buildId) {
    if (debug)
      logger.info(`[stale-check] Build ID changed (${storedBuildId} → ${meta.buildId}), comparing hashes...`)

    const dumpRows = await fetchDump(event)
    if (!dumpRows) {
      logger.warn('[stale-check] Failed to fetch dump for hash comparison')
      return { action: 'none', dbCount, dumpCount: meta.pageCount, reason: 'dump_fetch_failed' }
    }

    // Get current DB hashes
    const dbHashes = await getDbContentHashes(event)

    // Find changed and new pages
    const changedRoutes: string[] = []
    const newRows: DumpRow[] = []

    for (const row of dumpRows) {
      const dbHash = dbHashes.get(row.route)
      if (dbHash === undefined) {
        // New page not in DB
        newRows.push(row)
      }
      else if (dbHash !== row.content_hash) {
        // Hash changed - mark pending for re-index
        changedRoutes.push(row.route)
      }
      // If hash matches, page is unchanged - do nothing
    }

    // Insert new pages from dump (already has full content)
    if (newRows.length > 0) {
      await insertFromDump(event, newRows)
      if (debug)
        logger.info(`[stale-check] Added ${newRows.length} new pages from dump`)
    }

    // Mark changed pages as pending
    if (changedRoutes.length > 0) {
      await markRoutesPending(event, changedRoutes)
      if (debug)
        logger.info(`[stale-check] Marked ${changedRoutes.length} pages pending (hash changed)`)
    }

    await setStoredBuildId(event, meta.buildId)

    const unchangedCount = dumpRows.length - newRows.length - changedRoutes.length
    logger.info(`[stale-check] Build ID changed: ${changedRoutes.length} changed, ${newRows.length} new, ${unchangedCount} unchanged (buildId: ${meta.buildId})`)

    return {
      action: changedRoutes.length > 0 || newRows.length > 0 ? 'marked_pending' : 'none',
      buildId: meta.buildId,
      dbCount: dbCount + newRows.length,
      dumpCount: meta.pageCount,
      changedCount: changedRoutes.length,
      addedCount: newRows.length,
    }
  }

  // Case 3: Same build ID - no action needed
  if (debug)
    logger.info('[stale-check] Build ID unchanged, no action needed')

  return {
    action: 'none',
    buildId: meta.buildId,
    dbCount,
    dumpCount: meta.pageCount,
  }
}
