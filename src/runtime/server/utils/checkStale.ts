import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { DumpRow } from '../db/shared'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../db'
import { countPages } from '../db/queries'
import { decompressFromBase64, importDbDump } from '../db/shared'
import { logger } from '../logger'

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
}

/**
 * Fetch build metadata from static assets
 */
async function fetchBuildMeta(event: H3Event): Promise<BuildMeta | null> {
  const cfEnv = event.context?.cloudflare?.env as { ASSETS?: { fetch: (req: Request | string) => Promise<Response> } } | undefined

  // Try Cloudflare ASSETS binding first
  if (cfEnv?.ASSETS?.fetch) {
    const response = await cfEnv.ASSETS.fetch(new Request('https://assets.local/__ai-ready/pages.meta.json'))
      .catch(() => null)
    if (response?.ok) {
      return response.json().catch(() => null)
    }
  }

  // Fallback to HTTP fetch
  return globalThis.$fetch('/__ai-ready/pages.meta.json')
    .catch(() => null) as Promise<BuildMeta | null>
}

/**
 * Fetch and decompress dump data
 */
async function fetchDump(event: H3Event): Promise<DumpRow[] | null> {
  const cfEnv = event.context?.cloudflare?.env as { ASSETS?: { fetch: (req: Request | string) => Promise<Response> } } | undefined

  let dumpData: string | null = null

  // Try Cloudflare ASSETS binding first
  if (cfEnv?.ASSETS?.fetch) {
    const response = await cfEnv.ASSETS.fetch(new Request('https://assets.local/__ai-ready/pages.dump'))
      .catch(() => null)
    if (response?.ok) {
      dumpData = await response.text()
    }
  }

  // Fallback to HTTP fetch
  if (!dumpData) {
    dumpData = await globalThis.$fetch('/__ai-ready/pages.dump', { responseType: 'text' })
      .catch(() => null) as string | null
  }

  if (!dumpData)
    return null

  return decompressFromBase64<DumpRow[]>(dumpData)
}

/**
 * Get stored build ID from database
 */
async function getStoredBuildId(event: H3Event): Promise<string | null> {
  const db = await useDatabase(event)
  const row = await db.first<{ value: string }>('SELECT value FROM _ai_ready_info WHERE id = ?', ['build_id'])
  return row?.value || null
}

/**
 * Set stored build ID in database
 */
async function setStoredBuildId(event: H3Event, buildId: string): Promise<void> {
  const db = await useDatabase(event)
  await db.exec('INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)', ['build_id', buildId])
}

/**
 * Mark all non-error pages as pending (need recheck)
 * Error pages have no content to re-index
 */
async function markAllPagesPending(event: H3Event): Promise<number> {
  const db = await useDatabase(event)
  await db.exec('UPDATE ai_ready_pages SET indexed = 0 WHERE is_error = 0')
  return countPages(event, { where: { pending: true } })
}

/**
 * Check if data is stale and handle restore/mark-pending
 * Called at start of cron - handles:
 * 1. Empty DB → restore from dump
 * 2. Build ID changed → mark all pages pending for recheck
 */
export async function checkAndHandleStale(event: H3Event): Promise<StaleCheckResult> {
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

  // Case 2: Build ID changed - mark all pages pending
  if (storedBuildId !== meta.buildId) {
    if (debug)
      logger.info(`[stale-check] Build ID changed (${storedBuildId} → ${meta.buildId}), marking pages pending...`)

    const pendingCount = await markAllPagesPending(event)
    await setStoredBuildId(event, meta.buildId)

    logger.info(`[stale-check] Marked ${pendingCount} pages as pending for recheck (buildId: ${meta.buildId})`)
    return {
      action: 'marked_pending',
      buildId: meta.buildId,
      dbCount,
      dumpCount: meta.pageCount,
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
