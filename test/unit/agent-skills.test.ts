import { createHash } from 'node:crypto'
import { mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AGENT_SKILLS_SCHEMA, resolveAgentSkillsConfig } from '../../src/utils/agent-skills'

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
