import { eventHandler, getQuery, setResponseStatus } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { releaseCronLock, tryAcquireCronLock } from '../../db/queries'
import { logger } from '../../logger'
import { batchIndexPages } from '../../utils/batchIndex'

export default eventHandler(async (event) => {
  const { requireAuth } = await import('../../utils/auth')
  requireAuth(event)

  const lock = await tryAcquireCronLock(event)
  if (lock._tag === 'held') {
    setResponseStatus(event, 409)
    return { locked: true }
  }

  const query = getQuery(event)
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    runtimeSync?: { batchSize?: number }
  }
  const defaultLimit = Math.max(1, Math.min(config.runtimeSync?.batchSize ?? 10, 50)) || 10

  const limit = query.limit ? Math.max(1, Math.min(50, Math.trunc(Number(query.limit)) || defaultLimit)) : defaultLimit
  const timeout = query.timeout ? Math.max(1000, Math.trunc(Number(query.timeout)) || 30000) : undefined

  try {
    const result = await batchIndexPages(event, {
      limit,
      all: query.all === 'true' || query.all === '1',
      timeout,
    })

    return {
      indexed: result.indexed,
      remaining: result.remaining,
      errors: result.errors.length > 0 ? result.errors : undefined,
      duration: result.duration,
      complete: result.complete,
    }
  }
  finally {
    await releaseCronLock(event, lock.token).catch((err) => {
      logger.warn(`[poll] Failed to release lock: ${err?.message || err}`)
    })
  }
})
