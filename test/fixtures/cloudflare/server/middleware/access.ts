import { createError, defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

export default defineEventHandler((event) => {
  if (import.meta.prerender)
    return
  const config = useRuntimeConfig(event)
  if (config.cloudflareNegotiationProtectAbout && (event.path === '/about' || event.path === '/about/'))
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (config.cloudflareNegotiationProtectDocs && event.path === '/docs/api')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
})
