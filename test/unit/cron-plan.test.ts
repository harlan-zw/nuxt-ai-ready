import type { CronFastPathStatus } from '../../src/runtime/server/db/queries'
import { describe, expect, it } from 'vitest'
import { resolveCronPlan } from '../../src/runtime/server/utils/cron-plan'

const status: CronFastPathStatus = {
  totalPages: 144,
  pendingPages: 0,
  indexNowPending: 70,
  lastStaleCheck: 1_000,
  buildId: 'build',
  indexNowBackoff: null,
  sitemapsNeedCrawl: 0,
}

describe('cron plan', () => {
  it('derives sitemap recrawl cadence from runtime sync ttl', () => {
    const plan = resolveCronPlan({
      status,
      runtimeSyncTtlSeconds: 3600,
      indexNowEnabled: true,
      staleCheckNeeded: false,
      now: 10_000,
    })

    expect(plan.sitemapIntervalMinutes).toBe(60)
  })

  it('does not attempt IndexNow during active backoff when sitemap work runs', () => {
    const plan = resolveCronPlan({
      status: {
        ...status,
        sitemapsNeedCrawl: 1,
        indexNowBackoff: { until: 70_000, attempt: 4 },
      },
      runtimeSyncTtlSeconds: 3600,
      indexNowEnabled: true,
      staleCheckNeeded: false,
      now: 10_000,
    })

    expect(plan.hasWork).toBe(true)
    expect(plan.runIndexNow).toBe(false)
  })
})
