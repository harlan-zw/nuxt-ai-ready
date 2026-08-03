import type { useNitroApp } from '#nuxtseo/nitro'
import { closeDrizzle } from '../db'

type NitroApp = ReturnType<typeof useNitroApp>

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
