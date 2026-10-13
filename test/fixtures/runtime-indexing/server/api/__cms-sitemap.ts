import { defineEventHandler } from 'h3'

export default defineEventHandler(() => {
  const lastmod = (globalThis as { __driftLastmod?: string }).__driftLastmod
  return [{ loc: '/drift-page', ...(lastmod ? { lastmod } : {}) }]
})
