import { defineEventHandler } from 'nuxt/server'
import { readNativeDriverState } from '../utils/database-probe'
import { releaseDatabaseWork } from '../utils/deferred-database'

export default defineEventHandler(async () => ({
  pageCount: await releaseDatabaseWork(),
  isOpen: readNativeDriverState(),
}))
