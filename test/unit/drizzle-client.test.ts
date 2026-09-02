import type { H3Event } from '#nuxtseo/h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  closeDriver: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('#ai-ready-virtual/db-provider.mjs', () => ({
  createClient: mocks.createClient,
}))

vi.mock('../../src/runtime/server/db/drizzle/providers/sqlite', () => ({
  createClient: mocks.createClient,
}))

vi.mock('../../src/runtime/server/db/drizzle/providers/sqlite.ts', () => ({
  createClient: mocks.createClient,
}))

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': { database: { filename: ':memory:' } } }),
}))

vi.mock('../../src/runtime/server/db/drizzle/raw', () => ({
  closeDriver: mocks.closeDriver,
}))

describe('drizzle client lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.closeDriver.mockReset()
    mocks.createClient.mockReset()
  })

  it.each([
    ['event', { context: {} } as H3Event],
    ['fallback', undefined],
  ])('shares concurrent first client creation for the %s scope', async (_scope, event) => {
    mocks.createClient.mockImplementation(async () => {
      await Promise.resolve()
      return { dialect: 'postgres', db: {} }
    })
    const { closeDrizzle, useDrizzle } = await import('../../src/runtime/server/db/drizzle/client')

    const clients = await Promise.all(Array.from({ length: 5 }, () => useDrizzle(event)))
    await closeDrizzle(event)

    expect(new Set(clients).size).toBe(1)
    expect(mocks.createClient).toHaveBeenCalledTimes(1)
    expect(mocks.closeDriver).toHaveBeenCalledTimes(1)
  })

  it('closes an event client that is still opening when the response ends', async () => {
    let resolveClient: ((client: { dialect: 'postgres', db: object }) => void) | undefined
    mocks.createClient.mockImplementation(() => new Promise((resolve) => {
      resolveClient = resolve
    }))
    const { finishDrizzleResponse, useDrizzle } = await import('../../src/runtime/server/db/drizzle/client')
    const event = { context: {} } as H3Event

    const opening = useDrizzle(event)
    const finishing = finishDrizzleResponse(event)
    await vi.waitFor(() => expect(resolveClient).toBeTypeOf('function'))
    resolveClient?.({ dialect: 'postgres', db: {} })
    await Promise.all([opening, finishing])

    expect(mocks.closeDriver).toHaveBeenCalledTimes(1)
  })
})
