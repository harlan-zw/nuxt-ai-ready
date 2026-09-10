import type { LlmsTxtConfig } from '../../src/runtime/types'
import { createResolver, loadNuxt } from '@nuxt/kit'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('external agent skill links in llms.txt', () => {
  it.each([
    { siteUrl: '', url: 'tool/SKILL.md', expected: '/docs/.well-known/agent-skills/tool/SKILL.md' },
    { siteUrl: '', url: '../tool/SKILL.md?version=2#install', expected: '/docs/.well-known/tool/SKILL.md?version=2#install' },
    { siteUrl: '', url: '//cdn.example.com/tool/SKILL.md', expected: '//cdn.example.com/tool/SKILL.md' },
    { siteUrl: '', url: 'https://cdn.example.com/tool/SKILL.md', expected: 'https://cdn.example.com/tool/SKILL.md' },
    { siteUrl: '', url: '/tool/SKILL.md', expected: '/tool/SKILL.md' },
    { siteUrl: 'https://site.example.com', url: 'tool/SKILL.md', expected: 'https://site.example.com/docs/.well-known/agent-skills/tool/SKILL.md' },
    { siteUrl: 'https://site.example.com', url: '//cdn.example.com/tool/SKILL.md', expected: '//cdn.example.com/tool/SKILL.md' },
    { siteUrl: 'https://site.example.com', url: '/tool/SKILL.md', expected: 'https://site.example.com/tool/SKILL.md' },
  ])('resolves $url with site.url="$siteUrl"', async ({ siteUrl, url, expected }) => {
    const nuxt = await loadNuxt({
      cwd: resolve('../fixtures/agent-skills'),
      dev: false,
      ready: false,
      overrides: { site: { url: siteUrl } },
    })
    nuxt.options.aiReady = {
      agentSkills: {
        dir: false,
        skills: [{
          source: 'external',
          name: 'external-tool',
          type: 'skill-md',
          description: 'Use the external tool.',
          url,
          digest: `sha256:${'a'.repeat(64)}`,
        }],
      },
    }
    let sections: LlmsTxtConfig['sections'] = []
    nuxt.hook('ai-ready:llms-txt', (payload) => {
      sections = payload.sections
    })

    await nuxt.ready().finally(() => nuxt.close())

    expect(sections?.find(section => section.title === 'Agent Skills')?.links).toEqual([
      { title: 'external-tool', href: expected, description: 'Use the external tool.' },
    ])
  })
})
