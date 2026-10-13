import { defineEventHandler, getQuery } from 'h3'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const state = globalThis as { __driftVersion?: string, __driftLastmod?: string }
  state.__driftVersion = String(query.version)
  state.__driftLastmod = typeof query.lastmod === 'string' ? query.lastmod : undefined
  return { ok: true }
})
