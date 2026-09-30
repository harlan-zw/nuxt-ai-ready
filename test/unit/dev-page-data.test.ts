import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryPages } from '../../src/runtime/server/db/queries'
import { logger } from '../../src/runtime/server/logger'

vi.mock('#nuxtseo/nitro', () => ({
  useEvent: vi.fn(),
  useRuntimeConfig: vi.fn(),
}))

vi.mock('../../src/runtime/server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}))

afterEach(() => vi.restoreAllMocks())

describe('page queries in dev', () => {
  it('returns empty page data and reports one informational notice', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await queryPages()).toEqual([])
    expect(await queryPages()).toEqual([])
    expect(warn).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Page data unavailable in dev'))
  })
})
