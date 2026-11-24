import { definePlugin } from 'nitro'
import { DB_CONTEXT_KEY, DB_PROMISE_CONTEXT_KEY, DB_WORK_CONTEXT_KEY } from '../db/context'

export default definePlugin(({ hooks }) => {
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
