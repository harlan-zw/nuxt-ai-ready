import type { ResolvedAiTermsConfig } from '../../ai-terms'
import { createError, defineEventHandler, setResponseStatus, useRuntimeConfig } from 'nuxt/server'

export default defineEventHandler((event) => {
  event.res.headers.set('Access-Control-Allow-Origin', '*')
  event.res.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  event.res.headers.set('Access-Control-Allow-Headers', 'AI-Purpose')
  if (event.req.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return null
  }
  if (!['GET', 'HEAD'].includes(event.req.method)) {
    event.res.headers.set('Allow', 'GET, HEAD, OPTIONS')
    throw createError({ status: 405, statusText: 'Method Not Allowed' })
  }
  const config = (useRuntimeConfig()['nuxt-ai-ready'] as unknown as {
    aiTerms?: ResolvedAiTermsConfig
  }).aiTerms
  if (!config)
    throw createError({ status: 404, message: 'AI Terms is not configured.' })
  event.res.headers.set('Content-Type', 'application/json; charset=utf-8')
  event.res.headers.set('Cache-Control', 'public, max-age=3600')
  if (event.req.method === 'HEAD')
    return
  return config.document
})
