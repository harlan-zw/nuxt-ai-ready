import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const fixtureRoot = resolve('../fixtures/agent-skills')
const localSkill = await readFile(resolve('../fixtures/agent-skills/skills/seo-audit/SKILL.md'), 'utf8')

describe('agent skills discovery', async () => {
  await setup({
    rootDir: fixtureRoot,
    build: true,
    server: true,
  })

  it('serves the exact v0.2.0 discovery index', async () => {
    const response = await fetch('/.well-known/agent-skills/index.json')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toContain('public')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    await expect(response.json()).resolves.toEqual({
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
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
    })
  })

  it('serves embedded local SKILL.md bytes with discovery headers', async () => {
    const response = await fetch('/.well-known/agent-skills/seo-audit/SKILL.md')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(response.headers.get('cache-control')).toContain('max-age=3600')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    await expect(response.text()).resolves.toBe(localSkill)
  })

  it.each([
    '/.well-known/agent-skills/index.json',
    '/.well-known/agent-skills/seo-audit/SKILL.md',
  ])('supports HEAD for %s', async (route) => {
    const response = await fetch(route, { method: 'HEAD' })
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('')
  })

  it('returns 404 for unknown local artifacts', async () => {
    const response = await fetch('/.well-known/agent-skills/unknown/SKILL.md')
    expect(response.status).toBe(404)
  })
})
