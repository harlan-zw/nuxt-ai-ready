import { agentSkillsIndex } from '#ai-ready-virtual/agent-skills.mjs'
import { assertMethod, eventHandler, setHeader } from '#nuxtseo/h3'
import { publicCacheControl } from '../../cache-control'

export default eventHandler((event) => {
  assertMethod(event, ['GET', 'HEAD'])
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Cache-Control', publicCacheControl(3600, 86400))
  setHeader(event, 'Access-Control-Allow-Origin', '*')
  return agentSkillsIndex
})
