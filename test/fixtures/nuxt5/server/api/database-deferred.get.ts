import { defineEventHandler } from 'nuxt/server'
import { countPages, useDrizzle } from '#ai-ready/server'
import { trackDrizzleWork } from '#ai-ready/server/db/drizzle/client'
import { recordNativeDriver } from '../utils/database-probe'
import { deferDatabaseWork } from '../utils/deferred-database'

export default defineEventHandler(async (event) => {
  const pageCount = await countPages(event)
  recordNativeDriver((await useDrizzle(event)).db)
  deferDatabaseWork(gate => trackDrizzleWork(event, gate.then(() => countPages(event))))
  return { pageCount }
})
