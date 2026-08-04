import { assertMethod, createError, eventHandler, getRequestURL, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { localAgentSkillArtifacts } from '#ai-ready-virtual/agent-skills.mjs'
import { toLogicalRoute } from '../../route-path'

export default eventHandler((event) => {
  assertMethod(event, ['GET', 'HEAD'])
  const path = toLogicalRoute(getRequestURL(event).pathname, useRuntimeConfig(event).app.baseURL)
  const content = localAgentSkillArtifacts[path]
  if (content === undefined) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Agent skill artifact not found',
    })
  }

  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400')
  setHeader(event, 'Access-Control-Allow-Origin', '*')
  return content
})
