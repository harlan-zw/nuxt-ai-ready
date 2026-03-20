import { eventHandler, getQuery } from 'h3'
import { batchIndexPages } from '../../utils/batchIndex'

export default eventHandler(async (event) => {
  const { requireAuth } = await import('../../utils/auth')
  requireAuth(event)

  const query = getQuery(event)

  const limit = query.limit ? Math.max(1, Math.min(50, Math.trunc(Number(query.limit)) || 10)) : undefined
  const timeout = query.timeout ? Math.max(1000, Math.trunc(Number(query.timeout)) || 30000) : undefined

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
})
