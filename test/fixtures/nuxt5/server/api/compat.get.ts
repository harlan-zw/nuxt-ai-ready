import { defineEventHandler } from 'nuxt/server'
import { countPages, useDrizzle } from '#ai-ready/server'
import { localFetch, useEvent, useRuntimeConfig } from '#nuxtseo/nitro'
import { recordNativeDriver } from '../utils/database-probe'

function readRequestContextMarker() {
  return (useEvent().context as Record<string, unknown>).aiReadyCompatMarker
}

export default defineEventHandler(async (event) => {
  ;(event.context as Record<string, unknown>).aiReadyCompatMarker = 'nuxt-5-context'
  const pageCount = await countPages(event)
  recordNativeDriver((await useDrizzle(event)).db)
  const nested = await localFetch('/api/database-nested', {}, event.context)
  if (!nested.ok || !(await nested.json()).isOpen)
    throw new Error('The nested request must borrow the open parent database.')
  const pageCountAfterNested = await countPages(event)
  return {
    marker: useRuntimeConfig().aiReadyCompatMarker,
    requestContextMarker: readRequestContextMarker(),
    pageCount,
    pageCountAfterNested,
  }
})
