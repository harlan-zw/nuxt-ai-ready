import { describe, expect, it, vi } from 'vitest'
import { parseSourceLastmod } from '../../src/runtime/server/db/seed'

vi.mock('#nuxtseo/nitro', () => ({ useRuntimeConfig: () => ({}) }))

describe('source sitemap date parsing', () => {
  it.each([
    ['2026-08-01', '2026-08-01T00:00:00.000Z'],
    ['2026-08-01T02:00+02:00', '2026-08-01T00:00:00.000Z'],
    ['2026-08-01T00:00:00.123456Z', '2026-08-01T00:00:00.123Z'],
    [new Date('2026-08-01'), '2026-08-01T00:00:00.000Z'],
    ['2026-02-30', null],
    ['2026-02-30T00:00:00Z', null],
    ['invalid', null],
    [undefined, null],
    [new Date(Number.NaN), null],
  ])('parses %s into a stable source date', (input, expected) => {
    expect(parseSourceLastmod(input)).toBe(expected)
  })
})
