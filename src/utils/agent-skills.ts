import type {
  AgentSkillConfig,
  AgentSkillsConfig,
  AgentSkillsIndexEntry,
  LocalAgentSkillConfig,
} from '../runtime/types'
import type {
  AgentSkillsConfigIssue,
  ResolvedAgentSkillsConfig,
} from './agent-skills-config'
import { createHash } from 'node:crypto'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseDocument } from 'yaml'
import { AGENT_SKILLS_SCHEMA } from './agent-skills-config'

export { AGENT_SKILLS_SCHEMA } from './agent-skills-config'
export type { AgentSkillsConfigIssue, ResolvedAgentSkillsConfig } from './agent-skills-config'

const namePattern = /^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const digestPattern = /^sha256:[a-f0-9]{64}$/
const urlBase = 'https://example.com/.well-known/agent-skills/index.json'

function skillRoute(name: string) {
  return `/.well-known/agent-skills/${name}/SKILL.md`
}

export const ROOT_SKILL_ALIAS = '/SKILL.md'

function aliasesOf(skill: { alias?: string | string[] }): string[] {
  return skill.alias === undefined ? [] : Array.isArray(skill.alias) ? skill.alias : [skill.alias]
}

function skillUrl(name: string) {
  return `${name}/SKILL.md`
}

/**
 * An alias is a second address for the same artifact bytes. It must be a
 * path-absolute `.md` route outside `/.well-known/` and outside the
 * module-owned markdown routes, so the discovery routes, the sitemap
 * markdown endpoint and the home page markdown twin stay unambiguous.
 */
function validateAlias(alias: unknown, index: number, sitemapMd: boolean): AgentSkillsConfigIssue[] {
  if (alias === undefined)
    return []
  if (Array.isArray(alias))
    return alias.flatMap(entry => validateAlias(entry, index, sitemapMd))
  if (typeof alias !== 'string' || !/^\/(?:[^/?#\s]+\/)*[^/?#\s]+\.md$/.test(alias) || alias.split('/').includes('..'))
    return [{ index, field: 'alias', message: 'must be a path-absolute route ending in .md, such as "/SKILL.md"' }]
  if (alias.startsWith('/.well-known/'))
    return [{ index, field: 'alias', message: 'must not use the /.well-known/ prefix reserved for discovery routes' }]
  if (alias === '/index.md')
    return [{ index, field: 'alias', message: 'must not use the module-owned markdown route "/index.md"' }]
  if (sitemapMd && alias === '/sitemap.md')
    return [{ index, field: 'alias', message: 'must not use the module-owned markdown route "/sitemap.md"' }]
  return []
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

function validateSkill(skill: unknown, index: number, sitemapMd: boolean): AgentSkillsConfigIssue[] {
  if (!isRecord(skill)) {
    return [{ index, field: 'source', message: 'must be a local or external skill entry' }]
  }

  const issues = validateCommonFields(skill, index)
  if (skill.source === 'local') {
    if (typeof skill.file !== 'string' || skill.file.trim().length === 0)
      issues.push({ index, field: 'file', message: 'must be a non-empty path relative to the Nuxt root directory' })
    issues.push(...validateAlias(skill.alias, index, sitemapMd))
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

type SkillFrontmatter
  = | { _tag: 'Ok', metadata: Record<string, unknown>, hasBody: boolean }
    | { _tag: 'Err', message: string }

/** The frontmatter block of a SKILL.md, parsed but not yet validated. */
export function readSkillFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^\uFEFF?---[\t ]*\r?\n([\s\S]*?)\r?\n---[\t ]*(?:\r?\n|$)/)
  if (!match?.[1])
    return { _tag: 'Err', message: 'must contain YAML frontmatter with name and description fields' }
  const document = parseDocument(match[1], { prettyErrors: false })
  if (document.errors.length > 0)
    return { _tag: 'Err', message: `contains invalid YAML frontmatter: ${document.errors[0]?.message || 'unknown YAML error'}` }
  const metadata = document.toJS() as unknown
  if (!isRecord(metadata))
    return { _tag: 'Err', message: 'frontmatter must be a YAML mapping with name and description fields' }
  return { _tag: 'Ok', metadata, hasBody: content.slice(match[0].length).trim().length > 0 }
}

function parseLocalSkillMetadata(
  content: string,
  skill: Extract<AgentSkillConfig, { source: 'local' }>,
  index: number,
): AgentSkillsConfigIssue[] {
  const frontmatter = readSkillFrontmatter(content)
  if (frontmatter._tag === 'Err')
    return [{ index, field: 'file', message: frontmatter.message }]
  const { metadata } = frontmatter

  const issues: AgentSkillsConfigIssue[] = []
  if (!frontmatter.hasBody) {
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
  | { _tag: 'Resolved', entry: AgentSkillsIndexEntry, routes: string[], content: string }
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
        const routes = [skillRoute(skill.name), ...aliasesOf(skill)]
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
          routes,
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

export interface ResolveAgentSkillsOptions {
  /**
   * Whether the module owns the `/sitemap.md` route. Mirrors the `sitemapMd`
   * module option, which is enabled unless set to false.
   */
  sitemapMd?: boolean
}

export async function resolveAgentSkillsConfig(
  config: false | AgentSkillsConfig | undefined,
  rootDir: string,
  options: ResolveAgentSkillsOptions = {},
): Promise<ResolvedAgentSkillsConfig> {
  if (config === false || config === undefined)
    return { _tag: 'Disabled' }

  if (!isRecord(config) || (config.skills !== undefined && !Array.isArray(config.skills))) {
    return {
      _tag: 'Invalid',
      issues: [{ field: 'agentSkills', message: 'skills must be an array when set' }],
    }
  }
  const configuredSkills: unknown[] = config.skills ?? []
  if (configuredSkills.length === 0)
    return { _tag: 'Disabled' }

  const sitemapMd = options.sitemapMd !== false
  const issues = configuredSkills.flatMap((skill, index) => validateSkill(skill, index, sitemapMd))
  const seenNames = new Set<string>()
  const seenAliases = new Set<string>()
  for (const [index, skill] of configuredSkills.entries()) {
    if (!isRecord(skill) || typeof skill.name !== 'string' || seenNames.has(skill.name)) {
      if (isRecord(skill) && typeof skill.name === 'string' && seenNames.has(skill.name))
        issues.push({ index, field: 'name', message: `duplicates the skill name "${skill.name}"` })
      continue
    }
    seenNames.add(skill.name)
    for (const alias of aliasesOf(skill as { alias?: string | string[] })) {
      if (seenAliases.has(alias))
        issues.push({ index, field: 'alias', message: `duplicates the alias "${alias}"` })
      seenAliases.add(alias)
    }
  }
  if (issues.length > 0)
    return { _tag: 'Invalid', issues }

  const skills = configuredSkills as AgentSkillConfig[]
  const resolved = await Promise.all(skills.map((skill, index) => skill.source === 'local'
    ? resolveLocalEntry(skill, index, rootDir)
    : Promise.resolve({ _tag: 'Resolved' as const, entry: resolveExternalEntry(skill) })))
  const fileIssues = resolved.flatMap(result => result._tag === 'Invalid' ? result.issues : [])
  if (fileIssues.length > 0)
    return { _tag: 'Invalid', issues: fileIssues }

  const entries: AgentSkillsIndexEntry[] = []
  const localArtifacts: Record<string, string> = {}
  const links: Extract<ResolvedAgentSkillsConfig, { _tag: 'Enabled' }>['links'] = []
  for (const result of resolved) {
    if (result._tag !== 'Resolved')
      continue
    entries.push(result.entry)
    if ('routes' in result) {
      for (const route of result.routes)
        localArtifacts[route] = result.content
      // Prefer the shortest alias: `/SKILL.md` beats `/skills/name/SKILL.md`.
      const [alias] = result.routes.slice(1).sort((a, b) => a.length - b.length)
      links.push({ source: 'local', name: result.entry.name, description: result.entry.description, href: alias ?? result.routes[0]! })
    }
    else {
      links.push({ source: 'external', name: result.entry.name, description: result.entry.description, href: result.entry.url })
    }
  }

  return {
    _tag: 'Enabled',
    index: {
      $schema: AGENT_SKILLS_SCHEMA,
      skills: entries,
    },
    localArtifacts,
    links,
  }
}

export interface DiscoverAgentSkillsOptions {
  /** The Nuxt root. Every published file must resolve inside it. */
  rootDir: string
  /** Directories to scan: the project root and its layers. Entries outside `rootDir` are skipped. */
  scanDirs: readonly string[]
  /** Directory name under each scan directory, such as `skills`. */
  dir: string
}

export interface DiscoveredAgentSkills {
  skills: LocalAgentSkillConfig[]
  issues: AgentSkillsConfigIssue[]
}

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

/**
 * The convention: `<dir>/<name>/SKILL.md`. Frontmatter supplies `name` and
 * `description`, so a skill needs no config entry, and `name` must equal the
 * directory name as the Agent Skills specification requires. Each skill is
 * also served at `/<dir>/<name>/SKILL.md`, so the URL mirrors the repository.
 * The first scan directory wins a name clash, which puts the project ahead of
 * its layers.
 */
export async function discoverAgentSkills(options: DiscoverAgentSkillsOptions): Promise<DiscoveredAgentSkills> {
  const dir = options.dir.replace(/^\.?\/+/, '').replace(/\/+$/, '')
  const skills: LocalAgentSkillConfig[] = []
  const issues: AgentSkillsConfigIssue[] = []
  const seen = new Set<string>()
  for (const scanDir of options.scanDirs) {
    const base = resolve(scanDir, dir)
    if (!isWithinDirectory(options.rootDir, base) && base !== options.rootDir)
      continue
    const entries = await readdir(base, { withFileTypes: true }).catch(() => {
      // A scan directory with no `<dir>` folder is the common case, not a fault.
      return []
    })
    for (const entry of entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      if (seen.has(entry.name))
        continue
      const file = join(base, entry.name, 'SKILL.md')
      const content = await readFile(file, 'utf8').catch(() => {
        // A directory without a SKILL.md is not a skill; skip it.
        return null
      })
      if (content === null)
        continue
      const relativeFile = toPosix(relative(options.rootDir, file))
      const frontmatter = readSkillFrontmatter(content)
      if (frontmatter._tag === 'Err') {
        issues.push({ field: 'file', message: `${relativeFile} ${frontmatter.message}` })
        continue
      }
      const { name, description } = frontmatter.metadata
      if (name !== entry.name) {
        issues.push({ field: 'name', message: `${relativeFile} frontmatter name "${String(name)}" must equal its directory name "${entry.name}"` })
        continue
      }
      if (typeof description !== 'string' || description.length === 0) {
        issues.push({ field: 'description', message: `${relativeFile} frontmatter must contain a description` })
        continue
      }
      seen.add(entry.name)
      skills.push({
        source: 'local',
        name: entry.name,
        description,
        file: relativeFile,
        alias: `/${dir}/${entry.name}/SKILL.md`,
      })
    }
  }
  return { skills, issues }
}

/** Explicit entries replace discovered ones with the same name; order is discovered first, then explicit. */
export function mergeAgentSkills(discovered: readonly AgentSkillConfig[], configured: readonly AgentSkillConfig[]): AgentSkillConfig[] {
  const overridden = new Set(configured.map(skill => skill.name))
  return [...discovered.filter(skill => !overridden.has(skill.name)), ...configured]
}

/**
 * `/SKILL.md` is where installers and people look first. Serve it for the
 * named local skill, or for the only local skill when nothing is named.
 */
export function applyRootAlias(
  skills: readonly AgentSkillConfig[],
  root: string | false | undefined,
): { _tag: 'Ok', skills: AgentSkillConfig[] } | { _tag: 'Invalid', issues: AgentSkillsConfigIssue[] } {
  if (root === false)
    return { _tag: 'Ok', skills: [...skills] }
  const locals = skills.filter((skill): skill is LocalAgentSkillConfig => skill.source === 'local')
  const target = root === undefined
    ? (locals.length === 1 ? locals[0] : undefined)
    : locals.find(skill => skill.name === root)
  if (root !== undefined && !target)
    return { _tag: 'Invalid', issues: [{ field: 'root', message: `names no local skill: "${root}"` }] }
  if (!target || aliasesOf(target).includes(ROOT_SKILL_ALIAS))
    return { _tag: 'Ok', skills: [...skills] }
  return {
    _tag: 'Ok',
    skills: skills.map(skill => skill === target ? { ...skill, alias: [...aliasesOf(skill), ROOT_SKILL_ALIAS] } : skill),
  }
}

export interface PrepareAgentSkillsOptions {
  rootDir: string
  scanDirs: readonly string[]
}

/**
 * Discovery plus explicit config, before the `ai-ready:agent-skills` hook runs.
 * The root alias is applied after the hook, so a skill the hook adds counts.
 */
export async function prepareAgentSkills(
  config: AgentSkillsConfig,
  options: PrepareAgentSkillsOptions,
): Promise<{ _tag: 'Ok', skills: AgentSkillConfig[] } | { _tag: 'Invalid', issues: AgentSkillsConfigIssue[] }> {
  if (config.dir !== undefined && config.dir !== false && typeof config.dir !== 'string')
    return { _tag: 'Invalid', issues: [{ field: 'dir', message: 'must be a string or false when set' }] }
  if (config.skills !== undefined && !Array.isArray(config.skills))
    return { _tag: 'Invalid', issues: [{ field: 'agentSkills', message: 'skills must be an array when set' }] }
  const discovered = config.dir === false
    ? { skills: [], issues: [] }
    : await discoverAgentSkills({ rootDir: options.rootDir, scanDirs: options.scanDirs, dir: config.dir ?? 'skills' })
  if (discovered.issues.length > 0)
    return { _tag: 'Invalid', issues: discovered.issues }
  return { _tag: 'Ok', skills: mergeAgentSkills(discovered.skills, (config.skills ?? []) as AgentSkillConfig[]) }
}
