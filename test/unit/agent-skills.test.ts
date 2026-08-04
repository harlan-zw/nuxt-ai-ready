import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
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
            url: '/.well-known/agent-skills/seo-audit/SKILL.md',
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
