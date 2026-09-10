import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AGENT_SKILLS_SCHEMA, applyRootAlias, discoverAgentSkills, mergeAgentSkills, prepareAgentSkills, resolveAgentSkillsConfig, ROOT_SKILL_ALIAS } from '../../src/utils/agent-skills'

const localSkill = `---
name: seo-audit
description: Audit a site for critical SEO issues.
---

# SEO audit
`

describe('resolveAgentSkillsConfig', () => {
  it('keeps discovery disabled without configured skills', async () => {
    await expect(resolveAgentSkillsConfig(undefined, '/app')).resolves.toEqual({ _tag: 'Disabled' })
    await expect(resolveAgentSkillsConfig(false, '/app')).resolves.toEqual({ _tag: 'Disabled' })
  })

  it('embeds local files and preserves validated external entries', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
    await writeFile(join(rootDir, 'SKILL.md'), localSkill)

    const result = await resolveAgentSkillsConfig({
      skills: [
        {
          source: 'local',
          name: 'seo-audit',
          description: 'Audit a site for critical SEO issues.',
          file: './SKILL.md',
        },
        {
          source: 'external',
          name: 'seo-toolkit',
          type: 'archive',
          description: 'Use the complete SEO toolkit and its supporting resources.',
          url: 'https://cdn.example.com/seo-toolkit.tar.gz',
          digest: `sha256:${'a'.repeat(64)}`,
        },
      ],
    }, rootDir)

    expect(result).toEqual({
      _tag: 'Enabled',
      index: {
        $schema: AGENT_SKILLS_SCHEMA,
        skills: [
          {
            name: 'seo-audit',
            type: 'skill-md',
            description: 'Audit a site for critical SEO issues.',
            url: 'seo-audit/SKILL.md',
            digest: `sha256:${createHash('sha256').update(localSkill).digest('hex')}`,
          },
          {
            name: 'seo-toolkit',
            type: 'archive',
            description: 'Use the complete SEO toolkit and its supporting resources.',
            url: 'https://cdn.example.com/seo-toolkit.tar.gz',
            digest: `sha256:${'a'.repeat(64)}`,
          },
        ],
      },
      localArtifacts: {
        '/.well-known/agent-skills/seo-audit/SKILL.md': localSkill,
      },
      links: [
        { source: 'local', name: 'seo-audit', description: 'Audit a site for critical SEO issues.', href: '/.well-known/agent-skills/seo-audit/SKILL.md' },
        { source: 'external', name: 'seo-toolkit', description: 'Use the complete SEO toolkit and its supporting resources.', href: 'https://cdn.example.com/seo-toolkit.tar.gz' },
      ],
    })
  })

  it.each([
    ['name', { source: 'external', name: '-bad', type: 'skill-md', description: 'Valid.', url: 'skill.md', digest: `sha256:${'a'.repeat(64)}` }],
    ['type', { source: 'external', name: 'valid', type: 'bundle', description: 'Valid.', url: 'skill.zip', digest: `sha256:${'a'.repeat(64)}` }],
    ['description', { source: 'external', name: 'valid', type: 'skill-md', description: '', url: 'skill.md', digest: `sha256:${'a'.repeat(64)}` }],
    ['url', { source: 'external', name: 'valid', type: 'skill-md', description: 'Valid.', url: 'https://exa mple.com/skill.md', digest: `sha256:${'a'.repeat(64)}` }],
    ['digest', { source: 'external', name: 'valid', type: 'skill-md', description: 'Valid.', url: 'skill.md', digest: 'sha256:nope' }],
  ])('returns tagged issues for an invalid %s', async (_, skill) => {
    const result = await resolveAgentSkillsConfig({ skills: [skill as never] }, '/app')
    expect(result._tag).toBe('Invalid')
    if (result._tag === 'Invalid')
      expect(result.issues[0]).toMatchObject({ index: 0 })
  })

  it('serves an alias route with the same bytes and keeps the index URL under .well-known', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
    await writeFile(join(rootDir, 'SKILL.md'), localSkill)

    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'seo-audit',
        description: 'Audit a site for critical SEO issues.',
        file: './SKILL.md',
        alias: '/SKILL.md',
      }],
    }, rootDir)

    expect(result).toMatchObject({
      _tag: 'Enabled',
      index: { skills: [{ name: 'seo-audit', url: 'seo-audit/SKILL.md' }] },
      localArtifacts: {
        '/.well-known/agent-skills/seo-audit/SKILL.md': localSkill,
        '/SKILL.md': localSkill,
      },
    })
  })

  it('rejects an alias that shadows a module-owned markdown route', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
    await writeFile(join(rootDir, 'SKILL.md'), localSkill)

    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'seo-audit',
        description: 'Audit a site for critical SEO issues.',
        file: './SKILL.md',
        alias: '/sitemap.md',
      }],
    }, rootDir)

    expect(result).toMatchObject({ _tag: 'Invalid', issues: [{ index: 0, field: 'alias' }] })
  })

  it.each([
    ['/sitemap.md', 'sitemap markdown route'],
    ['/index.md', 'home markdown route'],
  ])('rejects the module-owned alias %s (%s)', async (alias) => {
    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'seo-audit',
        description: 'Audit a site for critical SEO issues.',
        file: './SKILL.md',
        alias,
      }],
    }, '/app')

    expect(result).toMatchObject({ _tag: 'Invalid', issues: [{ index: 0, field: 'alias' }] })
  })

  it.each([
    ['SKILL.md', 'relative'],
    ['/skills/', 'directory'],
    ['/skill', 'no .md suffix'],
    ['/a/../SKILL.md', 'parent segment'],
    ['/.well-known/agent-skills/other/SKILL.md', 'well-known prefix'],
  ])('rejects the alias %s (%s)', async (alias) => {
    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'seo-audit',
        description: 'Audit a site for critical SEO issues.',
        file: './SKILL.md',
        alias,
      }],
    }, '/app')

    expect(result).toMatchObject({ _tag: 'Invalid', issues: [{ index: 0, field: 'alias' }] })
  })

  it('rejects two skills that claim the same alias', async () => {
    const skill = {
      source: 'local' as const,
      description: 'Audit a site for critical SEO issues.',
      file: './SKILL.md',
      alias: '/SKILL.md',
    }
    const result = await resolveAgentSkillsConfig({
      skills: [{ ...skill, name: 'seo-audit' }, { ...skill, name: 'seo-review' }],
    }, '/app')

    expect(result).toMatchObject({ _tag: 'Invalid', issues: [{ index: 1, field: 'alias' }] })
  })

  it('rejects duplicate names', async () => {
    const skill = {
      source: 'external' as const,
      name: 'duplicate',
      type: 'skill-md' as const,
      description: 'A useful skill.',
      url: 'duplicate/SKILL.md',
      digest: `sha256:${'a'.repeat(64)}` as `sha256:${string}`,
    }
    const result = await resolveAgentSkillsConfig({ skills: [skill, skill] }, '/app')
    expect(result).toMatchObject({ _tag: 'Invalid', issues: [{ index: 1, field: 'name' }] })
  })

  it('returns a tagged file issue when a local artifact cannot be read', async () => {
    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'missing',
        description: 'A missing local skill.',
        file: './missing/SKILL.md',
      }],
    }, '/app')

    expect(result).toMatchObject({ _tag: 'Invalid', issues: [{ index: 0, field: 'file' }] })
  })

  it('rejects local artifact paths outside the Nuxt root directory', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'escaped',
        description: 'A skill outside the Nuxt root directory.',
        file: '../SKILL.md',
      }],
    }, rootDir)

    expect(result).toEqual({
      _tag: 'Invalid',
      issues: [{
        index: 0,
        field: 'file',
        message: 'must resolve within the Nuxt root directory',
      }],
    })
  })

  it('rejects local artifact symlinks that escape the Nuxt root directory', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-root-'))
    const outsideDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-outside-'))
    const outsideFile = join(outsideDir, 'SKILL.md')
    await writeFile(outsideFile, `---\nname: escaped\ndescription: A symlinked skill.\n---\n\n# Escaped\n`)
    await symlink(outsideFile, join(rootDir, 'SKILL.md'))

    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'escaped',
        description: 'A symlinked skill.',
        file: './SKILL.md',
      }],
    }, rootDir)

    expect(result).toEqual({
      _tag: 'Invalid',
      issues: [{
        index: 0,
        field: 'file',
        message: 'must resolve within the Nuxt root directory',
      }],
    })
  })

  it('rejects local artifacts that are not valid UTF-8', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
    await writeFile(join(rootDir, 'SKILL.md'), Buffer.concat([
      Buffer.from(`---\nname: invalid-utf8\ndescription: Invalid UTF-8 bytes.\n---\n\n# Skill\n`),
      Buffer.from([0xFF]),
    ]))

    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'invalid-utf8',
        description: 'Invalid UTF-8 bytes.',
        file: './SKILL.md',
      }],
    }, rootDir)

    expect(result).toMatchObject({
      _tag: 'Invalid',
      issues: [{ index: 0, field: 'file', message: 'must contain valid UTF-8 text' }],
    })
  })

  it('requires local SKILL.md frontmatter', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
    await writeFile(join(rootDir, 'SKILL.md'), '# Missing frontmatter\n')

    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'missing-frontmatter',
        description: 'A skill without valid frontmatter.',
        file: './SKILL.md',
      }],
    }, rootDir)

    expect(result).toMatchObject({ _tag: 'Invalid', issues: [{ index: 0, field: 'file' }] })
  })

  it('requires Markdown instructions after local frontmatter', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
    await writeFile(join(rootDir, 'SKILL.md'), `---\nname: empty-skill\ndescription: A skill without instructions.\n---\n`)

    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'empty-skill',
        description: 'A skill without instructions.',
        file: './SKILL.md',
      }],
    }, rootDir)

    expect(result).toMatchObject({
      _tag: 'Invalid',
      issues: [{ index: 0, field: 'file', message: 'must contain Markdown instructions after its frontmatter' }],
    })
  })

  it.each(['', '   ', ' https://example.com/SKILL.md ', 'javascript:alert(1)', 'file:///tmp/SKILL.md'])('rejects an unsafe external URL: %j', async (url) => {
    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'external',
        name: 'external-skill',
        type: 'skill-md',
        description: 'An externally hosted skill.',
        url,
        digest: `sha256:${'a'.repeat(64)}`,
      }],
    }, '/app')

    expect(result).toMatchObject({ _tag: 'Invalid', issues: [{ index: 0, field: 'url' }] })
  })

  it('accepts an RFC 3986 relative external URL', async () => {
    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'external',
        name: 'external-skill',
        type: 'skill-md',
        description: 'An externally hosted skill.',
        url: '../external-skill/SKILL.md',
        digest: `sha256:${'a'.repeat(64)}`,
      }],
    }, '/app')

    expect(result).toMatchObject({ _tag: 'Enabled' })
  })

  it.each([
    ['name', 'another-name', 'Audit a site for critical SEO issues.'],
    ['description', 'seo-audit', 'A different description.'],
  ])('requires the configured %s to match local frontmatter', async (field, name, description) => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
    await writeFile(join(rootDir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n# Skill\n`)

    const result = await resolveAgentSkillsConfig({
      skills: [{
        source: 'local',
        name: 'seo-audit',
        description: 'Audit a site for critical SEO issues.',
        file: './SKILL.md',
      }],
    }, rootDir)

    expect(result).toMatchObject({ _tag: 'Invalid', issues: [{ index: 0, field }] })
  })
})

const reviewSkill = `---
name: site-review
description: Review a site's pages for content quality issues.
---

# Site review
`

async function skillsRoot(files: Record<string, string>): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(rootDir, path, '..'), { recursive: true })
    await writeFile(join(rootDir, path), content)
  }
  return rootDir
}

describe('discoverAgentSkills', () => {
  it('publishes every skills/<name>/SKILL.md with a repository-mirroring alias', async () => {
    const rootDir = await skillsRoot({
      'skills/seo-audit/SKILL.md': localSkill,
      'skills/site-review/SKILL.md': reviewSkill,
      'skills/notes.md': '# not a skill',
    })

    const result = await discoverAgentSkills({ rootDir, scanDirs: [rootDir], dir: 'skills' })

    expect(result.issues).toEqual([])
    expect(result.skills).toEqual([
      { source: 'local', name: 'seo-audit', description: 'Audit a site for critical SEO issues.', file: 'skills/seo-audit/SKILL.md', alias: '/skills/seo-audit/SKILL.md' },
      { source: 'local', name: 'site-review', description: 'Review a site\'s pages for content quality issues.', file: 'skills/site-review/SKILL.md', alias: '/skills/site-review/SKILL.md' },
    ])
  })

  it('lets the project shadow a layer skill of the same name', async () => {
    const rootDir = await skillsRoot({
      'skills/seo-audit/SKILL.md': localSkill,
      'layers/base/skills/seo-audit/SKILL.md': localSkill.replace('critical', 'layer'),
      'layers/base/skills/site-review/SKILL.md': reviewSkill,
    })

    const result = await discoverAgentSkills({ rootDir, scanDirs: [rootDir, join(rootDir, 'layers/base')], dir: 'skills' })

    expect(result.skills.map(skill => [skill.name, skill.file])).toEqual([
      ['seo-audit', 'skills/seo-audit/SKILL.md'],
      ['site-review', 'layers/base/skills/site-review/SKILL.md'],
    ])
  })

  it('skips a layer outside the Nuxt root', async () => {
    const rootDir = await skillsRoot({ 'skills/seo-audit/SKILL.md': localSkill })
    const outside = await skillsRoot({ 'skills/site-review/SKILL.md': reviewSkill })

    const result = await discoverAgentSkills({ rootDir, scanDirs: [rootDir, outside], dir: 'skills' })

    expect(result.skills.map(skill => skill.name)).toEqual(['seo-audit'])
  })

  it('reports a frontmatter name that does not match its directory, by file path', async () => {
    const rootDir = await skillsRoot({ 'skills/audit/SKILL.md': localSkill })

    const result = await discoverAgentSkills({ rootDir, scanDirs: [rootDir], dir: 'skills' })

    expect(result.skills).toEqual([])
    expect(result.issues).toEqual([{ field: 'name', message: 'skills/audit/SKILL.md frontmatter name "seo-audit" must equal its directory name "audit"' }])
  })

  it('finds nothing when the directory is absent', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
    await expect(discoverAgentSkills({ rootDir, scanDirs: [rootDir], dir: 'skills' })).resolves.toEqual({ skills: [], issues: [] })
  })
})

describe('mergeAgentSkills and applyRootAlias', () => {
  const discovered = [
    { source: 'local' as const, name: 'seo-audit', description: 'd', file: 'skills/seo-audit/SKILL.md', alias: '/skills/seo-audit/SKILL.md' },
    { source: 'local' as const, name: 'site-review', description: 'd', file: 'skills/site-review/SKILL.md', alias: '/skills/site-review/SKILL.md' },
  ]

  it('lets an explicit entry replace a discovered one by name and keeps the rest', () => {
    const explicit = { source: 'local' as const, name: 'seo-audit', description: 'd', file: './other/SKILL.md' }
    expect(mergeAgentSkills(discovered, [explicit])).toEqual([discovered[1], explicit])
  })

  it('adds /SKILL.md to the only local skill by default', () => {
    const result = applyRootAlias([discovered[0]!], undefined)
    expect(result).toEqual({ _tag: 'Ok', skills: [{ ...discovered[0], alias: ['/skills/seo-audit/SKILL.md', ROOT_SKILL_ALIAS] }] })
  })

  it('adds no root alias when several local skills exist and none is named', () => {
    expect(applyRootAlias(discovered, undefined)).toEqual({ _tag: 'Ok', skills: discovered })
  })

  it('names the root skill explicitly and rejects an unknown name', () => {
    const named = applyRootAlias(discovered, 'site-review')
    expect(named._tag).toBe('Ok')
    if (named._tag === 'Ok')
      expect(named.skills[1]).toMatchObject({ alias: ['/skills/site-review/SKILL.md', '/SKILL.md'] })
    expect(applyRootAlias(discovered, 'missing')).toEqual({ _tag: 'Invalid', issues: [{ field: 'root', message: 'names no local skill: "missing"' }] })
    expect(applyRootAlias(discovered, false)).toEqual({ _tag: 'Ok', skills: discovered })
  })
})

describe('prepareAgentSkills and resolve with aliases', () => {
  it.each([true, 0, 42, null, [], ['skills'], {}].map(dir => ({ dir })))('rejects invalid dir: $dir', async ({ dir }) => {
    // @ts-expect-error Config from JavaScript can contain invalid values.
    await expect(prepareAgentSkills({ dir }, { rootDir: '/app', scanDirs: [] })).resolves.toEqual({
      _tag: 'Invalid',
      issues: [{ field: 'dir', message: 'must be a string or false when set' }],
    })
  })

  it('discovers skills in a custom directory', async () => {
    const rootDir = await skillsRoot({ 'custom/seo-audit/SKILL.md': localSkill })

    await expect(prepareAgentSkills({ dir: 'custom' }, { rootDir, scanDirs: [rootDir] })).resolves.toMatchObject({
      _tag: 'Ok',
      skills: [{ name: 'seo-audit', file: 'custom/seo-audit/SKILL.md', alias: '/custom/seo-audit/SKILL.md' }],
    })
  })

  it('serves a discovered skill at its mirrored path, at /SKILL.md, and in the index', async () => {
    const rootDir = await skillsRoot({ 'skills/seo-audit/SKILL.md': localSkill })

    const prepared = await prepareAgentSkills({}, { rootDir, scanDirs: [rootDir] })
    expect(prepared._tag).toBe('Ok')
    if (prepared._tag !== 'Ok')
      return
    const rooted = applyRootAlias(prepared.skills, undefined)
    if (rooted._tag !== 'Ok')
      return
    const result = await resolveAgentSkillsConfig({ skills: rooted.skills }, rootDir)

    expect(result).toMatchObject({
      _tag: 'Enabled',
      index: { skills: [{ name: 'seo-audit', url: 'seo-audit/SKILL.md' }] },
      localArtifacts: {
        '/.well-known/agent-skills/seo-audit/SKILL.md': localSkill,
        '/skills/seo-audit/SKILL.md': localSkill,
        '/SKILL.md': localSkill,
      },
      links: [{ name: 'seo-audit', href: '/SKILL.md' }],
    })
  })

  it('is disabled when nothing is discovered and nothing is configured', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-skills-'))
    const prepared = await prepareAgentSkills({}, { rootDir, scanDirs: [rootDir] })
    expect(prepared).toEqual({ _tag: 'Ok', skills: [] })
    await expect(resolveAgentSkillsConfig({ skills: [] }, rootDir)).resolves.toEqual({ _tag: 'Disabled' })
  })

  it('turns discovery off with dir: false', async () => {
    const rootDir = await skillsRoot({ 'skills/seo-audit/SKILL.md': localSkill })
    await expect(prepareAgentSkills({ dir: false }, { rootDir, scanDirs: [rootDir] })).resolves.toEqual({ _tag: 'Ok', skills: [] })
  })
})
