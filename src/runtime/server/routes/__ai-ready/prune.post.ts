import type { ModulePublicRuntimeConfig } from '../../../../module'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { getStaleRoutes, pruneStaleRoutes } from '../../db/queries'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const query = getQuery(event)

  // Check secret if configured (skip for dry runs)
  const dry = query.dry === 'true' || query.dry === '1'
  if (!dry && config.runtimeSync.secret) {
    const secret = query.secret as string
    if (secret !== config.runtimeSync.secret) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  const ttl = query.ttl ? Number(query.ttl) : config.runtimeSync.pruneTtl

  // Dry run: preview stale routes without deleting
  if (dry) {
    const routes = await getStaleRoutes(event, ttl)
    return { routes, count: routes.length, ttl, dry: true }
  }

  // Execute prune
  const pruned = await pruneStaleRoutes(event, ttl)
  return { pruned, ttl, dry: false }
})
