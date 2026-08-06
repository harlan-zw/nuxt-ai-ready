import type {
  AgentSkillsIndex,
} from '../runtime/types'

export const AGENT_SKILLS_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'
export const AGENT_SKILLS_INDEX_ROUTE = '/.well-known/agent-skills/index.json'
export const AGENT_SKILLS_CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

export interface AgentSkillsConfigIssue {
  index?: number
  field: 'agentSkills' | 'source' | 'name' | 'type' | 'description' | 'file' | 'url' | 'digest'
  message: string
}

export type ResolvedAgentSkillsConfig
  = | { _tag: 'Disabled' }
    | { _tag: 'Invalid', issues: AgentSkillsConfigIssue[] }
    | {
      _tag: 'Enabled'
      index: AgentSkillsIndex
      localArtifacts: Record<string, string>
    }
