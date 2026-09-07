import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../..')

function readRepoDoc(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf-8')
}

describe('docs cron interval', () => {
  it('module registers the documented cron schedule', () => {
    const moduleSource = readRepoDoc('src/module.ts')
    const schedule = moduleSource.match(/const cronSchedule = '([^']+)'/)?.[1]
    expect(schedule).toBe('*/5 * * * *')
  })

  it('repo instruction docs describe the 5 minute cron interval', () => {
    for (const doc of ['CLAUDE.md', 'ARCHITECTURE.md']) {
      const content = readRepoDoc(doc)
      expect(content, `${doc} still claims a stale cron interval`).not.toContain('every minute')
      expect(content, `${doc} does not describe the 5 minute interval`).toContain('every 5 minutes')
    }
  })
})
