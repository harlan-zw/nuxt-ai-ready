import type { CronFastPathStatus } from '../db/queries'

export interface CronPlanInput {
  status: CronFastPathStatus
  runtimeSyncTtlSeconds: number
  indexNowEnabled: boolean
  staleCheckNeeded: boolean
  now: number
}

export interface CronPlan {
  hasWork: boolean
  runIndexNow: boolean
  sitemapIntervalMinutes: number
}

export function resolveSitemapIntervalMinutes(runtimeSyncTtlSeconds: number): number {
  return Math.max(1, Math.ceil(runtimeSyncTtlSeconds / 60))
}

export function resolveCronPlan(input: CronPlanInput): CronPlan {
  const { status, indexNowEnabled, staleCheckNeeded, now } = input
  const indexNowInBackoff = status.indexNowBackoff !== null
    && now < status.indexNowBackoff.until
  const runIndexNow = indexNowEnabled
    && status.indexNowPending > 0
    && !indexNowInBackoff

  return {
    sitemapIntervalMinutes: resolveSitemapIntervalMinutes(input.runtimeSyncTtlSeconds),
    runIndexNow,
    hasWork: staleCheckNeeded
      || status.pendingPages > 0
      || status.sitemapsNeedCrawl > 0
      || runIndexNow,
  }
}
