import { defineEventHandler } from 'nuxt/server'
import { readNativeDriverState } from '../utils/database-probe'

export default defineEventHandler(() => ({ isOpen: readNativeDriverState() }))
