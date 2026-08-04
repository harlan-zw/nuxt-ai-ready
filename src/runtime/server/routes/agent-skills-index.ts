import { eventHandler, setHeader } from 'h3'
import { agentSkillsIndex } from '#ai-ready-virtual/agent-skills.mjs'

export default eventHandler((event) => {
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400')
  setHeader(event, 'Access-Control-Allow-Origin', '*')
  return agentSkillsIndex
})
