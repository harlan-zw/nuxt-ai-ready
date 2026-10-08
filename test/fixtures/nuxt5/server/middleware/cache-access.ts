import { createError, defineEventHandler } from 'nuxt/server'

export default defineEventHandler((event) => {
  if (new URL(event.req.url).pathname === '/cache/protected.md')
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
})
