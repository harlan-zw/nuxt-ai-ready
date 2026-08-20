import { createError, defineEventHandler, setHeader } from 'h3'

export default defineEventHandler((event) => {
  setHeader(event, 'x-upstream-error', 'preserved')
  throw createError({ statusCode: 503 })
})
