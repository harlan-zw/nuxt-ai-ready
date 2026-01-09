import { eventHandler, getQuery } from 'h3'
import { useDatabase } from '../../db'
import { getNextUnindexedRoute, getUnindexedCount } from '../../db/queries'
import { logger } from '../../logger'
import { indexPageByRoute } from '../../utils/indexPage'

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 10, 50) // Max 50 per request

  const db = await useDatabase(event)

  const beforeCount = await getUnindexedCount(db)
  if (beforeCount === 0) {
    return { indexed: 0, remaining: 0 }
  }

  let indexed = 0
  const errors: string[] = []

  for (let i = 0; i < limit; i++) {
    const route = await getNextUnindexedRoute(db)
    if (!route)
      break

    const result = await indexPageByRoute(route, event, {
      markFailedAsError: true,
      force: true,
    })

    if (result.success) {
      indexed++
      logger.debug(`[poll] Indexed: ${route}`)
    }
    else {
      errors.push(route)
    }
  }

  const remaining = await getUnindexedCount(db)

  return {
    indexed,
    remaining,
    errors: errors.length > 0 ? errors : undefined,
  }
})
