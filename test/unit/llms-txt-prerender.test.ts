import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLlmsTxtFiles } from '../../src/runtime/llms-txt-utils'

const config = vi.hoisted(() => ({
  database: { _tag: 'Disabled' as 'Disabled' | 'Enabled' },
  llmsTxt: { pages: 'sitemap' as 'sitemap' | 'all', markdownLinks: true, sections: [] },
  warn: vi.fn(),
}))

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ 'app': { baseURL: '/' }, 'nuxt-ai-ready': config }),
  useEvent: () => undefined,
}))
vi.mock('#site-config/server/composables/getSiteConfig', () => ({ getSiteConfig: () => ({ name: 'Example', url: 'https://example.com' }) }))
vi.mock('#site-config/server/composables/utils', () => ({
  withSiteUrl: (_event: unknown, path: string) => `https://example.com${path}`,
  withSiteTrailingSlash: (_event: unknown, path: string) => path,
}))
vi.mock('../../src/runtime/server/utils/sitemap', () => ({
  fetchSitemapUrlGroups: async () => new Map([['pages', [
    { loc: 'https://example.com/about' },
    { loc: 'https://example.com/broken' },
  ]]]),
  getSitemapsFromConfig: () => [],
}))
vi.mock('#ai-ready-virtual/database-runtime.mjs', () => ({
  useRawDb: () => { throw new Error('Prerender must not open a runtime database.') },
  initSchema: () => { throw new Error('Prerender must not initialize a runtime database.') },
}))
vi.mock('../../src/runtime/server/utils/checkStale', () => ({ checkAndHandleStale: vi.fn() }))
vi.mock('../../src/runtime/server/logger', () => ({ logger: { warn: config.warn } }))

beforeEach(() => vi.clearAllMocks())

function event() {
  return {
    req: new Request('https://example.com/llms.txt'),
    url: new URL('https://example.com/llms.txt'),
    path: '/llms.txt',
    context: {},
  } as unknown as H3Event
}

describe.skipIf(!import.meta.prerender).each(['Disabled', 'Enabled'] as const)('prerender with database %s', (database) => {
  it.each(['sitemap', 'all'] as const)('uses build metadata with pages %s', async (pages) => {
    config.database._tag = database
    config.llmsTxt.pages = pages

    const text = (await buildLlmsTxtFiles(event()))['/llms.txt']!

    expect(text).toContain('[About page](https://example.com/about.md): The about page description.')
    expect(text).not.toContain('/broken')
    expect(config.warn).not.toHaveBeenCalled()
    if (pages === 'all')
      expect(text).toContain('[Retired page](https://example.com/retired.md)')
    else
      expect(text).not.toContain('/retired')
  })
})

describe.skipIf(import.meta.prerender)('runtime with database disabled', () => {
  it.each(['sitemap', 'all'] as const)('keeps sitemap fallback with pages %s', async (pages) => {
    config.database._tag = 'Disabled'
    config.llmsTxt.pages = pages

    const text = (await buildLlmsTxtFiles(event()))['/llms.txt']!

    expect(text).toContain('[/about](https://example.com/about.md)')
    expect(text).not.toContain('About page')
    expect(text).not.toContain('/retired')
    expect(config.warn).not.toHaveBeenCalled()
  })
})
