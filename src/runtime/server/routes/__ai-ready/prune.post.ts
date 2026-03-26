import type { ModulePublicRuntimeConfig } from '../../../../module'
import { eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { getStaleRoutes, pruneStaleRoutes } from '../../db/queries'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const query = getQuery(event)

  const dry = query.dry === 'true' || query.dry === '1'

  // Require auth for non-dry runs
  if (!dry) {
    const { requireAuth } = await import('../../utils/auth')
    requireAuth(event)
  }

  const ttl = query.ttl ? Math.max(0, Math.trunc(Number(query.ttl)) || config.runtimeSync.pruneTtl) : config.runtimeSync.pruneTtl

  // Dry run: preview stale routes without deleting
  if (dry) {
    const routes = await getStaleRoutes(event, ttl)
    return { routes, count: routes.length, ttl, dry: true }
  }

  // Execute prune
  const pruned = await pruneStaleRoutes(event, ttl)
  return { pruned, ttl, dry: false }
})
