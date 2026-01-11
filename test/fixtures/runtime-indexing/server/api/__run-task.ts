import { defineEventHandler, getQuery } from 'h3'
import { runTask } from 'nitropack/runtime'

export default defineEventHandler(async (event) => {
  const { name } = getQuery(event) as { name: string }

  if (!name)
    return { error: 'Missing task name' }

  const result = await runTask(name).catch((err: Error) => ({ error: err.message }))
  return result
})
