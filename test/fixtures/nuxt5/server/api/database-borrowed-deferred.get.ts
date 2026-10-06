import { defineEventHandler } from 'nuxt/server'
import { countPages } from '#ai-ready/server'
import { localFetch } from '#nuxtseo/nitro'

export default defineEventHandler(async (event) => {
  const pageCount = await countPages(event)
  const nested = await localFetch('/api/database-nested-deferred', {}, event.context)
  if (!nested.ok || !(await nested.json()).isOpen)
    throw new Error('The nested deferred request must borrow the open owner database.')
  return { pageCount }
})
