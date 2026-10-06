import { createError, defineEventHandler, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import { localAgentSkillArtifacts } from '#ai-ready-virtual/agent-skills.mjs'
import { publicCacheControl } from '../../cache-control'
import { toLogicalRoute } from '../../route-path'

export default defineEventHandler((event) => {
  if (!['GET', 'HEAD'].includes(event.req.method))
    throw createError({ status: 405, statusText: 'Method Not Allowed' })
  const path = toLogicalRoute(getRequestURL(event).pathname, useRuntimeConfig().app.baseURL)
  const content = localAgentSkillArtifacts[path]
  if (content === undefined) {
    throw createError({
      status: 404,
      statusText: 'Agent skill artifact not found',
    })
  }
  event.res.headers.set('Content-Type', 'text/markdown; charset=utf-8')
  event.res.headers.set('Cache-Control', publicCacheControl(3600, 86400))
  event.res.headers.set('Access-Control-Allow-Origin', '*')
  return content
})
