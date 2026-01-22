import type { NitroApp } from 'nitropack/types'
import { closeDatabase } from '../db/index'

export default function dbLifecyclePlugin(nitroApp: NitroApp) {
  // Close request-scoped database connection
  nitroApp.hooks.hook('afterResponse', async (event) => {
    await closeDatabase(event)
  })

  // Close fallback database connection on app close
  nitroApp.hooks.hook('close', async () => {
    await closeDatabase()
  })
}
