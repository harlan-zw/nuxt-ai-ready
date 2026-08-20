import type { CronFastPathStatus } from '../db/queries'

export interface CronPlanInput {
  status: CronFastPathStatus
  runtimeSyncTtlSeconds: number
  staleCheckNeeded: boolean
}

export interface CronPlan {
  hasWork: boolean
  sitemapIntervalMinutes: number
}

export function resolveSitemapIntervalMinutes(runtimeSyncTtlSeconds: number): number {
  return Math.max(1, Math.ceil(runtimeSyncTtlSeconds / 60))
}

export function resolveCronPlan(input: CronPlanInput): CronPlan {
  const { status, staleCheckNeeded } = input

  return {
    sitemapIntervalMinutes: resolveSitemapIntervalMinutes(input.runtimeSyncTtlSeconds),
    hasWork: staleCheckNeeded
      || status.pendingPages > 0
      || status.sitemapsNeedCrawl > 0,
  }
}
