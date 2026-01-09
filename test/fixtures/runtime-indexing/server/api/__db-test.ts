import { getAllPages, getPage, getPageCount, searchPages, upsertPage, useDatabase } from '#ai-ready'
import { defineEventHandler, getQuery, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const { action, ...params } = getQuery(event) as { action: string, [k: string]: unknown }
  const db = await useDatabase(event)

  switch (action) {
    case 'count':
      return { count: await getPageCount(db) }

    case 'list':
      return { pages: await getAllPages(db) }

    case 'get':
      return { page: await getPage(db, params.route as string) }

    case 'search':
      return { results: await searchPages(db, params.q as string, { limit: Number(params.limit) || 10 }) }

    case 'upsert': {
      const body = await readBody(event)
      await upsertPage(db, body)
      return { success: true }
    }

    default:
      return { error: 'Unknown action' }
  }
})
