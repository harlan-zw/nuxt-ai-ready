import { defineEventHandler, getQuery } from 'h3'

export default defineEventHandler((event) => {
  (globalThis as { __driftVersion?: string }).__driftVersion = String(getQuery(event).version)
  return { ok: true }
})
