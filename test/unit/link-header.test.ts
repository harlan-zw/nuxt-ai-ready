import type { ModulePublicRuntimeConfig } from '../../src/module'
import type { RuntimeI18nConfig } from '../../src/runtime/server/utils/i18n'
import { describe, expect, it } from 'vitest'
import { buildLinkHeader } from '../../src/runtime/server/utils/link-header'

const baseConfig = {} as ModulePublicRuntimeConfig

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127)
      return false
  }
  return true
}

describe('buildLinkHeader', () => {
  const resolveExampleUrl = (path: string) => new URL(path, 'https://example.com').href

  it('emits ASCII-only Link header for paths with non-Latin characters (html variant)', () => {
    const header = buildLinkHeader('/gh/owner/repo/skill:中文.md', 'html', baseConfig)
    expect(isAscii(header)).toBe(true)
    expect(header).toContain('rel="alternate"')
    expect(header).toContain('type="text/markdown"')
  })

  it('emits ASCII-only Link header for paths with non-Latin characters (markdown variant)', () => {
    const header = buildLinkHeader('/gh/luoyuweidu1/podcastcut-skills/podcastcut:后期', 'markdown', baseConfig)
    expect(isAscii(header)).toBe(true)
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
    const config = { ...baseConfig, i18n }
    const header = buildLinkHeader('/page:日本.md', 'html', config)
    expect(isAscii(header)).toBe(true)
  })

  it('emits absolute i18n hreflang alternates when a base URL is provided', () => {
    const i18n: RuntimeI18nConfig = {
      defaultLocale: 'en',
      strategy: 'prefix_except_default',
      locales: [
        { code: 'en', hreflang: 'en' },
        { code: 'fr', hreflang: 'fr' },
      ],
    }
    const config = { i18n } as ModulePublicRuntimeConfig
    const header = buildLinkHeader('/about', 'html', config, resolveExampleUrl)

    expect(header).toContain('<https://example.com/about.md>; rel="alternate"; type="text/markdown"')
    expect(header).toContain('<https://example.com/about>; rel="alternate"; hreflang="en"')
    expect(header).toContain('<https://example.com/fr/about>; rel="alternate"; hreflang="fr"')
  })

  it('advertises sibling markdown for trailing-slash routes', () => {
    const header = buildLinkHeader('/about/', 'html', baseConfig)

    expect(header).toContain('</about.md>; rel="alternate"; type="text/markdown"')
    expect(header).not.toContain('/about/index.md')
  })

  it('emits absolute markdown i18n hreflang alternates when a base URL is provided', () => {
    const i18n: RuntimeI18nConfig = {
      defaultLocale: 'en',
      strategy: 'prefix_except_default',
      locales: [
        { code: 'en', hreflang: 'en' },
        { code: 'fr', hreflang: 'fr' },
      ],
    }
    const config = { i18n } as ModulePublicRuntimeConfig
    const header = buildLinkHeader('/about', 'markdown', config, resolveExampleUrl)

    expect(header).toContain('<https://example.com/about>; rel="alternate"; type="text/html"')
    expect(header).toContain('<https://example.com/about.md>; rel="alternate"; hreflang="en"')
    expect(header).toContain('<https://example.com/fr/about.md>; rel="alternate"; hreflang="fr"')
  })

  it('keeps i18n hreflang alternates relative without a base URL', () => {
    const i18n: RuntimeI18nConfig = {
      defaultLocale: 'en',
      strategy: 'prefix_except_default',
      locales: [
        { code: 'en', hreflang: 'en' },
        { code: 'fr', hreflang: 'fr' },
      ],
    }
    const config = { i18n } as ModulePublicRuntimeConfig
    const header = buildLinkHeader('/about', 'html', config)

    expect(header).toContain('</about>; rel="alternate"; hreflang="en"')
    expect(header).toContain('</fr/about>; rel="alternate"; hreflang="fr"')
  })

  it('advertises translated slugs rather than prefixed default ones', () => {
    const i18n: RuntimeI18nConfig = {
      defaultLocale: 'en',
      strategy: 'prefix_except_default',
      locales: [
        { code: 'en', hreflang: 'en' },
        { code: 'fr', hreflang: 'fr' },
      ],
      pages: { about: { en: '/about', fr: '/a-propos' } },
    }
    const config = { i18n } as ModulePublicRuntimeConfig
    const header = buildLinkHeader('/about', 'html', config, resolveExampleUrl)

    expect(header).toContain('<https://example.com/about>; rel="alternate"; hreflang="en"')
    expect(header).toContain('<https://example.com/fr/a-propos>; rel="alternate"; hreflang="fr"')
    expect(header).not.toContain('/fr/about')
  })

  it('uses locale domains for hreflang alternates', () => {
    const i18n = {
      defaultLocale: 'en',
      strategy: 'prefix_and_default',
      differentDomains: true,
      locales: [
        { code: 'en', hreflang: 'en', domain: 'en.example.com' },
        { code: 'fr', hreflang: 'fr', domain: 'fr.example.com' },
      ],
      pages: { about: { en: '/about', fr: '/a-propos' } },
    } satisfies RuntimeI18nConfig
    const config = { ...baseConfig, i18n }
    const header = buildLinkHeader('/about', 'html', config, resolveExampleUrl, { host: 'en.example.com' })

    expect(header).toContain('<https://en.example.com/about>; rel="alternate"; hreflang="en"')
    expect(header).toContain('<https://fr.example.com/a-propos>; rel="alternate"; hreflang="fr"')
  })

  it('advertises the API catalog only when enabled', () => {
    const enabledConfig = {
      apiCatalog: {
        href: 'https://example.com/.well-known/api-catalog',
      },
    } as ModulePublicRuntimeConfig

    expect(buildLinkHeader('/', 'html', enabledConfig)).toContain(
      '<https://example.com/.well-known/api-catalog>; rel="api-catalog"',
    )
    expect(buildLinkHeader('/', 'html', baseConfig)).not.toContain('rel="api-catalog"')
  })
})
