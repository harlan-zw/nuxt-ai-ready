import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const fixtureRoot = resolve('../fixtures/agent-skills')
const localSkillBytes = await readFile(resolve('../fixtures/agent-skills/skills/seo-audit/SKILL.md'))
const localSkill = localSkillBytes.toString('utf8')

describe('agent skills discovery', async () => {
  await setup({
    rootDir: fixtureRoot,
    build: true,
    server: true,
  })

  it('redirects origin-root discovery into a non-root app base', async () => {
    const response = await fetch('/.well-known/agent-skills/index.json', { redirect: 'manual' })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/docs/.well-known/agent-skills/index.json')
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
          url: 'seo-audit/SKILL.md',
          digest: `sha256:${createHash('sha256').update(localSkillBytes).digest('hex')}`,
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
    const response = await fetch('/docs/.well-known/agent-skills/seo-audit/SKILL.md')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(response.headers.get('cache-control')).toContain('max-age=3600')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    const responseBytes = Buffer.from(await response.arrayBuffer())
    expect(responseBytes.toString('utf8')).toBe(localSkill)
    expect(createHash('sha256').update(responseBytes).digest('hex')).toBe(
      createHash('sha256').update(localSkillBytes).digest('hex'),
    )
  })

  it('resolves an advertised local artifact after the app-base redirect', async () => {
    const indexResponse = await fetch('/.well-known/agent-skills/index.json')
    const index = await indexResponse.json()
    const artifactUrl = new URL(index.skills[0].url, indexResponse.url)
    const artifactResponse = await globalThis.fetch(artifactUrl)

    expect(artifactUrl.pathname).toBe('/docs/.well-known/agent-skills/seo-audit/SKILL.md')
    expect(artifactResponse.status).toBe(200)
    await expect(artifactResponse.text()).resolves.toBe(localSkill)
  })

  it.each([
    '/docs/.well-known/agent-skills/index.json',
    '/docs/.well-known/agent-skills/seo-audit/SKILL.md',
  ])('supports HEAD for %s', async (route) => {
    const response = await fetch(route, { method: 'HEAD' })
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('')
  })

  it.each([
    '/docs/.well-known/agent-skills/index.json',
    '/docs/.well-known/agent-skills/seo-audit/SKILL.md',
  ])('rejects POST for %s', async (route) => {
    const response = await fetch(route, { method: 'POST' })
    expect(response.status).toBe(405)
  })

  it('returns 404 for unknown local artifacts', async () => {
    const response = await fetch('/docs/.well-known/agent-skills/unknown/SKILL.md')
    expect(response.status).toBe(404)
  })

  it('preserves the content type of same-origin external archives', async () => {
    const response = await fetch('/docs/.well-known/agent-skills/external-tool.zip')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/zip')
    await expect(response.text()).resolves.toBe('external archive fixture\n')
  })
})
