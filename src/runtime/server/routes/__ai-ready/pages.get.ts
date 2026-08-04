import type { ModulePublicRuntimeConfig } from '../../../../module'
import type { PageEntry } from '../../db/queries'
import { eventHandler, getQuery, setHeader } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { countPages, queryPages, searchPages } from '../../db/queries'

const MAX_LIMIT = 50

function toLimit(value: unknown, fallback: number): number {
  const limit = Math.trunc(Number(value))
  if (!Number.isFinite(limit) || limit < 1)
    return fallback
  return Math.min(limit, MAX_LIMIT)
}

/**
 * Public page index powering the WebMCP site tools. Read-only and returns the
 * same content already published through llms.txt and the `.md` routes.
 */
export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const query = getQuery(event)

  const { maxAge, swr } = config.markdownCacheHeaders
  setHeader(event, 'cache-control', swr
    ? `public, max-age=${maxAge}, stale-while-revalidate=${maxAge}`
    : `public, max-age=${maxAge}`)

  const route = typeof query.route === 'string' ? query.route.trim() : ''
  if (route) {
    const page = await queryPages(event, { route })
    return {
      page: page && !page.isError
        ? {
            route: page.route,
            title: page.title || page.route,
            description: page.description || '',
          }
        : null,
    }
  }

  const search = String(query.q || '').trim()
  if (search) {
    return { query: search, results: await searchPages(event, search, { limit: toLimit(query.limit, 10) }) }
  }

  const limit = toLimit(query.limit, 20)
  const offset = Math.max(0, Math.trunc(Number(query.offset)) || 0)
  const [pages, total] = await Promise.all([
    queryPages(event, { limit, offset }),
    countPages(event),
  ])

  return {
    pages: (pages as PageEntry[]).map(p => ({
      route: p.route,
      title: p.title || p.route,
      description: p.description || '',
    })),
    total,
    limit,
    offset,
    hasMore: offset + pages.length < total,
  }
})
