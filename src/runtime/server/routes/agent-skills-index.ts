import { createError, defineEventHandler } from 'nuxt/server'
import { agentSkillsIndex } from '#ai-ready-virtual/agent-skills.mjs'
import { publicCacheControl } from '../../cache-control'

export default defineEventHandler((event) => {
  if (!['GET', 'HEAD'].includes(event.req.method))
    throw createError({ status: 405, statusText: 'Method Not Allowed' })
  event.res.headers.set('Content-Type', 'application/json; charset=utf-8')
  event.res.headers.set('Cache-Control', publicCacheControl(3600, 86400))
  event.res.headers.set('Access-Control-Allow-Origin', '*')
  return agentSkillsIndex
})
