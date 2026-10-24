import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AI_READY_CRON_SCHEDULE } from '../../src/utils/cron'

const repoRoot = resolve(import.meta.dirname, '../..')

describe('docs cron interval', () => {
  it('module registers the documented cron schedule', () => {
    expect(AI_READY_CRON_SCHEDULE).toBe('*/5 * * * *')
  })

  it('repo instruction docs describe the 5 minute cron interval', () => {
    const docs = {
      'CLAUDE.md': readFileSync(resolve(repoRoot, 'CLAUDE.md'), 'utf-8'),
      'ARCHITECTURE.md': readFileSync(resolve(repoRoot, 'ARCHITECTURE.md'), 'utf-8'),
    }
    for (const [doc, content] of Object.entries(docs)) {
      expect(content, `${doc} still claims a stale cron interval`).not.toContain('every minute')
      expect(content, `${doc} does not describe the 5 minute interval`).toContain('every 5 minutes')
    }
  })
})
