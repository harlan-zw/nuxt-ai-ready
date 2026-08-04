import { agentSkillsIndex } from '#ai-ready-virtual/agent-skills.mjs'
import { assertMethod, eventHandler, setHeader } from '#nuxtseo/h3'

export default eventHandler((event) => {
  assertMethod(event, ['GET', 'HEAD'])
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400')
  setHeader(event, 'Access-Control-Allow-Origin', '*')
  return agentSkillsIndex
})
