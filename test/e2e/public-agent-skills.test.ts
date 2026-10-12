import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('public agent skills discovery', async () => {
  await setup({ rootDir: resolve('../fixtures/public-agent-skills'), build: true, server: true })

  it('discovers the configured public directory without exposing root skills', async () => {
    const response = await fetch('/.well-known/agent-skills/index.json')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ skills: [{ name: 'seo-audit' }] })
    const artifact = await fetch('/.well-known/agent-skills/seo-audit/SKILL.md')
    expect(artifact.status).toBe(200)
    expect(await artifact.text()).toContain('Read the sitemap')
    expect((await fetch('/.well-known/agent-skills/internal/SKILL.md')).status).toBe(404)
    expect((await fetch('/skills/internal/SKILL.md')).status).toBe(404)
  })
})
