import { describe, expect, it } from 'vitest'
import { resolveIndexedUpdatedAt, resolvePageUpdatedAt } from '../../src/runtime/server/utils/page-updated-at'

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

describe('resolveIndexedUpdatedAt', () => {
  const now = new Date('2026-09-24T10:00:00.000Z')
  const runtimeRow = { contentHash: 'aaa', updatedAt: '2026-01-01T00:00:00.000Z', source: 'runtime' as const }
  const base = { declared: '', contentHash: 'bbb', now, detectDrift: true }

  it('keeps a declared date over detected drift', () => {
    expect(resolveIndexedUpdatedAt({ ...base, declared: '2025-05-05T00:00:00.000Z', previous: runtimeRow })).toBe('2025-05-05T00:00:00.000Z')
  })

  it('dates a page with the detection time when a runtime hash changes', () => {
    expect(resolveIndexedUpdatedAt({ ...base, previous: runtimeRow })).toBe(now.toISOString())
  })

  it('keeps the stored date when the hash is unchanged', () => {
    expect(resolveIndexedUpdatedAt({ ...base, contentHash: 'aaa', previous: runtimeRow })).toBe(runtimeRow.updatedAt)
  })

  it('gives no date on first index', () => {
    expect(resolveIndexedUpdatedAt({ ...base, previous: undefined })).toBe('')
    expect(resolveIndexedUpdatedAt({ ...base, previous: { contentHash: null, updatedAt: '', source: 'runtime' } })).toBe('')
  })

  it('does not treat a prerender hash as comparable', () => {
    expect(resolveIndexedUpdatedAt({ ...base, previous: { ...runtimeRow, source: 'prerender', updatedAt: '' } })).toBe('')
  })

  it('detects nothing when drift detection is off', () => {
    expect(resolveIndexedUpdatedAt({ ...base, previous: runtimeRow, detectDrift: false })).toBe('')
  })
})
