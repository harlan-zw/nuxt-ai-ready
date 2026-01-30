import type { NitroApp } from 'nitropack/types'
import { closeDrizzle } from '../db'

export default function dbLifecyclePlugin(nitroApp: NitroApp) {
  // Close request-scoped database connection
  nitroApp.hooks.hook('afterResponse', async (event) => {
    await closeDrizzle(event)
  })

  // Close fallback database connection on app close
  nitroApp.hooks.hook('close', async () => {
    await closeDrizzle()
  })
}
