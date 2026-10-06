import { defineEventHandler } from 'nuxt/server'
import { countPages, useDrizzle } from '#ai-ready/server'
import { trackDrizzleWork } from '#ai-ready/server/db/drizzle/client'
import { recordNativeDriver, readNativeDriverState } from '../utils/database-probe'
import { deferDatabaseWork } from '../utils/deferred-database'

export default defineEventHandler(async (event) => {
  recordNativeDriver((await useDrizzle(event)).db)
  deferDatabaseWork(gate => trackDrizzleWork(event, gate.then(() => countPages(event))))
  return { isOpen: readNativeDriverState() }
})
