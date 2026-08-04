import type {
  AgentSkillConfig,
  AgentSkillsConfig,
  AgentSkillsIndex,
  AgentSkillsIndexEntry,
} from '../runtime/types'
import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { parseDocument } from 'yaml'

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

const namePattern = /^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const digestPattern = /^sha256:[a-f0-9]{64}$/
const urlBase = 'https://example.com/.well-known/agent-skills/index.json'

function skillRoute(name: string) {
  return `/.well-known/agent-skills/${name}/SKILL.md`
}

function skillUrl(name: string) {
  return `${name}/SKILL.md`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWithinDirectory(directory: string, file: string): boolean {
  const path = relative(directory, file)
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

function validateCommonFields(skill: Record<string, unknown>, index: number): AgentSkillsConfigIssue[] {
  const issues: AgentSkillsConfigIssue[] = []
  if (typeof skill.name !== 'string' || !namePattern.test(skill.name)) {
    issues.push({
      index,
      field: 'name',
      message: 'must contain 1 to 64 lowercase alphanumeric or hyphen characters, without leading, trailing, or consecutive hyphens',
    })
  }
  if (typeof skill.description !== 'string' || skill.description.length === 0 || [...skill.description].length > 1024) {
    issues.push({
      index,
      field: 'description',
      message: 'must contain 1 to 1024 characters',
    })
  }
  return issues
}

function validateSkill(skill: unknown, index: number): AgentSkillsConfigIssue[] {
  if (!isRecord(skill)) {
    return [{ index, field: 'source', message: 'must be a local or external skill entry' }]
  }

  const issues = validateCommonFields(skill, index)
  if (skill.source === 'local') {
    if (typeof skill.file !== 'string' || skill.file.trim().length === 0)
      issues.push({ index, field: 'file', message: 'must be a non-empty path relative to the Nuxt root directory' })
    return issues
  }

  if (skill.source === 'external') {
    if (skill.type !== 'skill-md' && skill.type !== 'archive')
      issues.push({ index, field: 'type', message: 'must be "skill-md" or "archive"' })
    if (typeof skill.url !== 'string'
      || skill.url.trim().length === 0
      || skill.url !== skill.url.trim()
      || !URL.canParse(skill.url, urlBase)
      || !['http:', 'https:'].includes(new URL(skill.url, urlBase).protocol)) {
      issues.push({ index, field: 'url', message: 'must be an HTTP(S), path-absolute, or relative URL' })
    }
    if (typeof skill.digest !== 'string' || !digestPattern.test(skill.digest))
      issues.push({ index, field: 'digest', message: 'must use the format sha256: followed by 64 lowercase hexadecimal characters' })
    return issues
  }

  issues.push({ index, field: 'source', message: 'must be "local" or "external"' })
  return issues
}

function resolveExternalEntry(skill: Extract<AgentSkillConfig, { source: 'external' }>): AgentSkillsIndexEntry {
  return {
    name: skill.name,
    type: skill.type,
    description: skill.description,
    url: skill.url,
    digest: skill.digest,
  }
}

function parseLocalSkillMetadata(
  content: string,
  skill: Extract<AgentSkillConfig, { source: 'local' }>,
  index: number,
): AgentSkillsConfigIssue[] {
  const match = content.match(/^\uFEFF?---[\t ]*\r?\n([\s\S]*?)\r?\n---[\t ]*(?:\r?\n|$)/)
  if (!match?.[1]) {
    return [{
      index,
      field: 'file',
      message: 'must contain YAML frontmatter with name and description fields',
    }]
  }

  const document = parseDocument(match[1], { prettyErrors: false })
  if (document.errors.length > 0) {
    return [{
      index,
      field: 'file',
      message: `contains invalid YAML frontmatter: ${document.errors[0]?.message || 'unknown YAML error'}`,
    }]
  }

  const metadata = document.toJS() as unknown
  if (!isRecord(metadata)) {
    return [{
      index,
      field: 'file',
      message: 'frontmatter must be a YAML mapping with name and description fields',
    }]
  }

  const issues: AgentSkillsConfigIssue[] = []
  if (!content.slice(match[0].length).trim()) {
    issues.push({
      index,
      field: 'file',
      message: 'must contain Markdown instructions after its frontmatter',
    })
  }
  if (metadata.name !== skill.name) {
    issues.push({
      index,
      field: 'name',
      message: `must exactly match the local SKILL.md frontmatter name "${String(metadata.name)}"`,
    })
  }
  if (metadata.description !== skill.description) {
    issues.push({
      index,
      field: 'description',
      message: 'must exactly match the local SKILL.md frontmatter description',
    })
  }
  return issues
}

async function resolveLocalEntry(
  skill: Extract<AgentSkillConfig, { source: 'local' }>,
  index: number,
  rootDir: string,
): Promise<
  | { _tag: 'Resolved', entry: AgentSkillsIndexEntry, route: string, content: string }
  | { _tag: 'Invalid', issues: AgentSkillsConfigIssue[] }
> {
  const file = resolve(rootDir, skill.file)
  if (isAbsolute(skill.file) || !isWithinDirectory(rootDir, file)) {
    return {
      _tag: 'Invalid',
      issues: [{
        index,
        field: 'file',
        message: 'must resolve within the Nuxt root directory',
      }],
    }
  }
  return Promise.all([realpath(rootDir), realpath(file)])
    .then(([realRootDir, realFile]) => {
      if (!isWithinDirectory(realRootDir, realFile)) {
        return {
          _tag: 'Invalid' as const,
          issues: [{
            index,
            field: 'file' as const,
            message: 'must resolve within the Nuxt root directory',
          }],
        }
      }
      return readFile(realFile).then((content) => {
        const text = content.toString('utf8')
        if (!Buffer.from(text, 'utf8').equals(content)) {
          return {
            _tag: 'Invalid' as const,
            issues: [{
              index,
              field: 'file' as const,
              message: 'must contain valid UTF-8 text',
            }],
          }
        }
        const metadataIssues = parseLocalSkillMetadata(text, skill, index)
        if (metadataIssues.length > 0) {
          return {
            _tag: 'Invalid' as const,
            issues: metadataIssues,
          }
        }
        const route = skillRoute(skill.name)
        const digest = `sha256:${createHash('sha256').update(content).digest('hex')}` as const
        return {
          _tag: 'Resolved' as const,
          entry: {
            name: skill.name,
            type: 'skill-md' as const,
            description: skill.description,
            url: skillUrl(skill.name),
            digest,
          },
          route,
          content: text,
        }
      })
    })
    .catch((error: unknown) => ({
      _tag: 'Invalid' as const,
      issues: [{
        index,
        field: 'file' as const,
        message: `could not read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      }],
    }))
}

export async function resolveAgentSkillsConfig(
  config: false | AgentSkillsConfig | undefined,
  rootDir: string,
): Promise<ResolvedAgentSkillsConfig> {
  if (config === false || config === undefined)
    return { _tag: 'Disabled' }

  if (!isRecord(config) || !Array.isArray(config.skills)) {
    return {
      _tag: 'Invalid',
      issues: [{ field: 'agentSkills', message: 'must contain a skills array' }],
    }
  }

  const issues = config.skills.flatMap((skill, index) => validateSkill(skill, index))
  const seenNames = new Set<string>()
  for (const [index, skill] of config.skills.entries()) {
    if (!isRecord(skill) || typeof skill.name !== 'string' || seenNames.has(skill.name)) {
      if (isRecord(skill) && typeof skill.name === 'string' && seenNames.has(skill.name))
        issues.push({ index, field: 'name', message: `duplicates the skill name "${skill.name}"` })
      continue
    }
    seenNames.add(skill.name)
  }
  if (issues.length > 0)
    return { _tag: 'Invalid', issues }

  const skills = config.skills as AgentSkillConfig[]
  const resolved = await Promise.all(skills.map((skill, index) => skill.source === 'local'
    ? resolveLocalEntry(skill, index, rootDir)
    : Promise.resolve({ _tag: 'Resolved' as const, entry: resolveExternalEntry(skill) })))
  const fileIssues = resolved.flatMap(result => result._tag === 'Invalid' ? result.issues : [])
  if (fileIssues.length > 0)
    return { _tag: 'Invalid', issues: fileIssues }

  const entries: AgentSkillsIndexEntry[] = []
  const localArtifacts: Record<string, string> = {}
  for (const result of resolved) {
    if (result._tag !== 'Resolved')
      continue
    entries.push(result.entry)
    if ('route' in result)
      localArtifacts[result.route] = result.content
  }

  return {
    _tag: 'Enabled',
    index: {
      $schema: AGENT_SKILLS_SCHEMA,
      skills: entries,
    },
    localArtifacts,
  }
}
