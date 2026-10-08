import type { ModulePublicRuntimeConfig } from '../../src/module'
import type { RuntimeI18nConfig } from '../../src/runtime/server/utils/i18n'
import { describe, expect, it } from 'vitest'
import { buildLinkHeader, buildStatusAwareLinkHeaders } from '../../src/runtime/server/utils/link-header'

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

  it('keeps canonical hreflang domains when a locale is available on both hosts', () => {
    const i18n: RuntimeI18nConfig = {
      defaultLocale: 'en',
      strategy: 'prefix_except_default',
      multiDomainLocales: true,
      locales: [
        { code: 'en', hreflang: 'en', domains: ['en.example.com', 'fr.example.com'], defaultForDomains: ['en.example.com'] },
        { code: 'fr', hreflang: 'fr', domains: ['en.example.com', 'fr.example.com'], defaultForDomains: ['fr.example.com'] },
      ],
      pages: { about: { en: '/about', fr: '/a-propos' } },
    }

    const header = buildLinkHeader('/a-propos', 'html', { ...baseConfig, i18n }, resolveExampleUrl, { host: 'fr.example.com' })

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

  it('points rel=canonical at the HTML page from the markdown variant', () => {
    const header = buildLinkHeader('/about', 'markdown', baseConfig, resolveExampleUrl)

    expect(header).toContain('<https://example.com/about>; rel="canonical"')
  })

  it('emits no rel=canonical on the html variant', () => {
    const header = buildLinkHeader('/about', 'html', baseConfig, resolveExampleUrl)

    expect(header).not.toContain('rel="canonical"')
  })

  it('emits rel=describedby pointing at llms.txt for both variants', () => {
    const html = buildLinkHeader('/about', 'html', baseConfig, resolveExampleUrl)
    const markdown = buildLinkHeader('/about', 'markdown', baseConfig, resolveExampleUrl)

    expect(html).toContain('<https://example.com/llms.txt>; rel="describedby"')
    expect(markdown).toContain('<https://example.com/llms.txt>; rel="describedby"')
  })

  it('omits rel=describedby when disabled', () => {
    const config = { describedby: false } as ModulePublicRuntimeConfig

    expect(buildLinkHeader('/about', 'html', config, resolveExampleUrl)).not.toContain('rel="describedby"')
    expect(buildLinkHeader('/about', 'markdown', config, resolveExampleUrl)).not.toContain('rel="describedby"')
  })
})

describe('status-aware Link headers', () => {
  const i18n: RuntimeI18nConfig = {
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    differentDomains: true,
    locales: [
      { code: 'en', hreflang: 'en', domain: 'en.example.com' },
      { code: 'fr', hreflang: 'fr', domain: 'fr.example.com' },
    ],
    pages: { about: { en: '/about', fr: '/a-propos' } },
  }

  it.each(['html', 'markdown'] as const)('preserves %s success and error headers with domains and a base path', (variant) => {
    const config = { i18n, apiCatalog: { href: 'https://example.com/docs/.well-known/api-catalog' } }
    const resolveUrl = (path: string) => `https://en.example.com/docs${path}`
    const headers = buildStatusAwareLinkHeaders('/about', variant, config, resolveUrl, { host: 'en.example.com' })
    const target = variant === 'html' ? '/about.md' : '/about'
    const canonical = variant === 'markdown' ? ', <https://en.example.com/docs/about>; rel="canonical"' : ''
    const apiCatalog = '<https://example.com/docs/.well-known/api-catalog>; rel="api-catalog"'
    const base = `<https://en.example.com/docs${target}>; rel="alternate"; type="text/${variant === 'html' ? 'markdown' : 'html'}"${canonical}, <https://en.example.com/docs/llms.txt>; rel="describedby"`
    const suffix = variant === 'markdown' ? '.md' : ''

    expect(headers.error).toBe(`${base}, ${apiCatalog}`)
    expect(headers.success).toBe(`${base}, <https://en.example.com/docs/about${suffix}>; rel="alternate"; hreflang="en", <https://fr.example.com/docs/a-propos${suffix}>; rel="alternate"; hreflang="fr", ${apiCatalog}`)
  })

  it('resolves shared request URLs once', () => {
    const resolved: string[] = []
    const headers = buildStatusAwareLinkHeaders('/about', 'html', { i18n }, (path) => {
      resolved.push(path)
      return `https://example.com${path}`
    })

    expect(resolved.filter(path => path === '/about.md')).toEqual(['/about.md'])
    expect(resolved.filter(path => path === '/llms.txt')).toEqual(['/llms.txt'])
    expect(headers.error).toContain('<https://example.com/llms.txt>; rel="describedby"')
    expect(headers.success).toContain('<https://example.com/llms.txt>; rel="describedby"')
  })

  it.each(['html', 'markdown'] as const)('keeps %s headers request-specific and ASCII-only', (variant) => {
    for (const origin of ['https://first.example.com', 'https://second.example.com']) {
      const headers = buildStatusAwareLinkHeaders('/中文', variant, { i18n }, path => `${origin}/base${path}`)
      expect(isAscii(headers.error)).toBe(true)
      expect(isAscii(headers.success)).toBe(true)
      expect(headers.error).toContain(`<${origin}/base/%E4%B8%AD%E6%96%87`)
      expect(headers.success).toContain(`<${origin}/base/%E4%B8%AD%E6%96%87`)
    }
  })

  it('omits disabled discovery links without i18n', () => {
    expect(buildStatusAwareLinkHeaders('/about', 'html', { describedby: false })).toEqual({
      error: '</about.md>; rel="alternate"; type="text/markdown"',
      success: '</about.md>; rel="alternate"; type="text/markdown"',
    })
  })

  it('keeps relative links when URL resolution fails', () => {
    const headers = buildStatusAwareLinkHeaders('/missing', 'html', {
      i18n: { ...i18n, differentDomains: false, locales: [{ code: 'en', hreflang: 'en' }, { code: 'fr', hreflang: 'fr' }] },
    }, () => { throw new Error('Site URL unavailable') })

    expect(headers).toEqual({
      error: '</missing.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"',
      success: '</missing.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby", </missing>; rel="alternate"; hreflang="en", </fr/missing>; rel="alternate"; hreflang="fr"',
    })
  })
})
