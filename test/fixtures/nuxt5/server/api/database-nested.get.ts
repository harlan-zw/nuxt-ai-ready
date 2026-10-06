import { defineEventHandler } from 'nuxt/server'
import { useDrizzle } from '#ai-ready/server'
import { recordNativeDriver, readNativeDriverState } from '../utils/database-probe'

export default defineEventHandler(async (event) => {
  recordNativeDriver((await useDrizzle(event)).db)
  return { isOpen: readNativeDriverState() }
})
