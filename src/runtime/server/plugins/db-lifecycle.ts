import type { useNitroApp } from '#nuxtseo/nitro'
import { DB_CONTEXT_KEY, DB_WORK_CONTEXT_KEY } from '../db/context'

type NitroApp = ReturnType<typeof useNitroApp>

export default function dbLifecyclePlugin(nitroApp: NitroApp) {
  // Close request-scoped database connection
  nitroApp.hooks.hook('afterResponse', async (event) => {
    if (!event.context?.[DB_CONTEXT_KEY] && !event.context?.[DB_WORK_CONTEXT_KEY])
      return
    const { finishDrizzleResponse } = await import('../db')
    await finishDrizzleResponse(event)
  })

  // Close fallback database connection on app close
  nitroApp.hooks.hook('close', async () => {
    const { closeDrizzle } = await import('../db')
    await closeDrizzle()
  })
}
