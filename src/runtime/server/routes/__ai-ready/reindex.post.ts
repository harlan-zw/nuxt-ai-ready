import { createError, eventHandler, getQuery, setResponseStatus } from '#nuxtseo/h3'
import { indexPageByRoute } from '../../utils/indexPage'

export default eventHandler(async (event) => {
  const { requireAuth } = await import('../../utils/auth')
  requireAuth(event)

  const query = getQuery(event)
  const route = typeof query.route === 'string' ? query.route.trim() : ''

  if (!route.startsWith('/')) {
    throw createError({ statusCode: 400, message: 'Invalid route. It must be an absolute path starting with "/", for example "/about".' })
  }

  const force = query.force !== 'false' && query.force !== '0'

  const result = await indexPageByRoute(route, event, { force })

  if (!result.success) {
    setResponseStatus(event, 502)
    return { route, indexed: false, error: result.error ?? `Failed to index ${route}` }
  }

  return {
    route,
    indexed: !result.skipped,
    skipped: result.skipped || undefined,
    contentChanged: result.contentChanged,
  }
})
