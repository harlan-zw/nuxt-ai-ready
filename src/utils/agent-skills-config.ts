import type {
  AgentSkillsIndex,
} from '../runtime/types'

export const AGENT_SKILLS_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'
export const AGENT_SKILLS_INDEX_ROUTE = '/.well-known/agent-skills/index.json'
export const AGENT_SKILLS_CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

export interface AgentSkillsConfigIssue {
  index?: number
  field: 'agentSkills' | 'source' | 'name' | 'type' | 'description' | 'file' | 'alias' | 'root' | 'dir' | 'url' | 'digest'
  message: string
}

export type ResolvedAgentSkillsConfig
  = | { _tag: 'Disabled' }
    | { _tag: 'Invalid', issues: AgentSkillsConfigIssue[] }
    | {
      _tag: 'Enabled'
      index: AgentSkillsIndex
      localArtifacts: Record<string, string>
      /** One llms.txt link per published skill: the alias when one exists, else the artifact URL. */
      links: Array<{ source: 'local' | 'external', name: string, description: string, href: string }>
    }

/** Resolve an external artifact against its discovery index, including when no site URL exists. */
export function resolveExternalSkillUrl(href: string, indexUrl: string): string {
  // URL parsing strips these control characters, so the passthrough branches must too.
  const normalized = href.replaceAll(/[\t\n\r]/g, '')
  // Return the URL-parsed form so remaining control characters are percent-encoded.
  if (URL.canParse(normalized))
    return new URL(normalized).href
  if (normalized.startsWith('//')) {
    // URL needs an origin to parse a protocol-relative href; rebuild it without the temporary origin.
    const resolved = new URL(normalized, 'https://nuxt-ai-ready.invalid')
    return `//${resolved.host}${resolved.pathname}${resolved.search}${resolved.hash}`
  }
  if (URL.canParse(indexUrl))
    return new URL(normalized, indexUrl).href

  // URL needs an origin to resolve dot segments, queries, and fragments.
  // Strip this temporary origin so the link uses the site's actual origin.
  const resolved = new URL(normalized, new URL(indexUrl, 'https://nuxt-ai-ready.invalid'))
  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}
