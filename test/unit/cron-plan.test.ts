import type { CronFastPathStatus } from '../../src/runtime/server/db/queries'
import { describe, expect, it } from 'vitest'
import { resolveCronPlan } from '../../src/runtime/server/utils/cron-plan'

const status: CronFastPathStatus = {
  totalPages: 144,
  pendingPages: 0,
  lastStaleCheck: 1_000,
  buildId: 'build',
  sitemapsNeedCrawl: 0,
}

describe('cron plan', () => {
  it('derives sitemap recrawl cadence from runtime sync ttl', () => {
    const plan = resolveCronPlan({
      status,
      runtimeSyncTtlSeconds: 3600,
      staleCheckNeeded: false,
    })

    expect(plan.sitemapIntervalMinutes).toBe(60)
  })

  it('runs when a sitemap needs crawling', () => {
    const plan = resolveCronPlan({
      status: {
        ...status,
        sitemapsNeedCrawl: 1,
      },
      runtimeSyncTtlSeconds: 3600,
      staleCheckNeeded: false,
    })

    expect(plan.hasWork).toBe(true)
  })
})
