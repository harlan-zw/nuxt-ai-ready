import type { ModulePublicRuntimeConfig } from '../../src/module'
import type { RuntimeI18nConfig } from '../../src/runtime/server/utils/i18n'
import { describe, expect, it } from 'vitest'
import { buildLinkHeader } from '../../src/runtime/server/utils/link-header'

const baseConfig = {} as ModulePublicRuntimeConfig

describe('buildLinkHeader', () => {
  it('emits ASCII-only Link header for paths with non-Latin characters (html variant)', () => {
    const header = buildLinkHeader('/gh/owner/repo/skill:中文.md', 'html', baseConfig)
    expect(/[^\x00-\x7F]/.test(header)).toBe(false)
    expect(header).toContain('rel="alternate"')
    expect(header).toContain('type="text/markdown"')
  })

  it('emits ASCII-only Link header for paths with non-Latin characters (markdown variant)', () => {
    const header = buildLinkHeader('/gh/luoyuweidu1/podcastcut-skills/podcastcut:后期', 'markdown', baseConfig)
    expect(/[^\x00-\x7F]/.test(header)).toBe(false)
    expect(header).toContain('rel="alternate"')
    expect(header).toContain('type="text/html"')
  })

  it('preserves path separators (does not encode "/")', () => {
    const header = buildLinkHeader('/gh/owner/repo/skill:中文', 'markdown', baseConfig)
    expect(header).toContain('/gh/owner/repo/')
  })

  it('encodes non-ASCII characters in i18n hreflang alternates', () => {
    const i18n: RuntimeI18nConfig = {
      defaultLocale: 'en',
      strategy: 'prefix_except_default',
      locales: [
        { code: 'en', hreflang: 'en' },
        { code: 'ja', hreflang: 'ja-JP' },
      ],
    }
    const config = { i18n } as ModulePublicRuntimeConfig
    const header = buildLinkHeader('/page:日本.md', 'html', config)
    expect(/[^\x00-\x7F]/.test(header)).toBe(false)
  })
})
