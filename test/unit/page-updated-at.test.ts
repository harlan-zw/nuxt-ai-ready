import { describe, expect, it } from 'vitest'
import { resolvePageUpdatedAt } from '../../src/runtime/server/utils/page-updated-at'

describe('resolvePageUpdatedAt', () => {
  it('returns an empty string when no source gives a date', () => {
    expect(resolvePageUpdatedAt(undefined, undefined)).toBe('')
    expect(resolvePageUpdatedAt('', '')).toBe('')
  })

  it('prefers the page meta date over the sitemap lastmod', () => {
    expect(resolvePageUpdatedAt('2026-01-01', '2026-02-03T04:05:06Z')).toBe('2026-02-03T04:05:06.000Z')
  })

  it('falls back to the sitemap lastmod', () => {
    expect(resolvePageUpdatedAt(new Date('2026-01-01T00:00:00Z'), undefined)).toBe('2026-01-01T00:00:00.000Z')
    expect(resolvePageUpdatedAt('2026-01-01', 'not a date')).toBe('2026-01-01T00:00:00.000Z')
  })

  it('ignores dates that do not parse', () => {
    expect(resolvePageUpdatedAt('garbage', 'also garbage')).toBe('')
  })
})
