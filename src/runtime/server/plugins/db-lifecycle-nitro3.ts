import type { AiReadyDatabaseEvent } from '../db/context'
import { defineNitroPlugin } from '#nuxtseo/nitro'
import { DB_CONTEXT_KEY, DB_PROMISE_CONTEXT_KEY, DB_WORK_CONTEXT_KEY } from '../db/context'

interface Nitro3LifecycleHooks {
  hook: {
    (name: 'response', callback: (response: Response, event: AiReadyDatabaseEvent) => Promise<void>): void
    (name: 'close', callback: () => Promise<void>): void
  }
}

export default defineNitroPlugin((nitroApp) => {
  // This adapter is selected only for Nitro 3. The maintainer uses Nitro 2
  // types, so narrow the hook boundary to Nitro 3's public lifecycle API.
  const hooks = nitroApp.hooks as unknown as Nitro3LifecycleHooks
  hooks.hook('response', async (_response, event) => {
    if (!event.context?.[DB_CONTEXT_KEY]
      && !event.context?.[DB_PROMISE_CONTEXT_KEY]
      && !event.context?.[DB_WORK_CONTEXT_KEY]) {
      return
    }
    const { finishDrizzleResponse } = await import('../db')
    await finishDrizzleResponse(event)
  })

  hooks.hook('close', async () => {
    const { closeDrizzle } = await import('../db')
    await closeDrizzle()
  })
})
