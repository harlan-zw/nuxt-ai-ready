import type { RuntimeI18nConfig } from '../../src/runtime/server/utils/i18n'
import { describe, expect, it } from 'vitest'
import { computeLocaleAlternates, localePath, resolveLocaleFromRoute } from '../../src/runtime/server/utils/i18n'
import { hasCjkLocale } from '../../src/utils/i18n'

const en = { code: 'en', hreflang: 'en' }
const fr = { code: 'fr', hreflang: 'fr-FR' }
const ja = { code: 'ja', hreflang: 'ja-JP' }

const prefixExceptDefault: RuntimeI18nConfig = {
  defaultLocale: 'en',
  strategy: 'prefix_except_default',
  locales: [en, fr],
}

const prefixAll: RuntimeI18nConfig = {
  defaultLocale: 'en',
  strategy: 'prefix',
  locales: [en, fr],
}

const noPrefix: RuntimeI18nConfig = {
  defaultLocale: 'en',
  strategy: 'no_prefix',
  locales: [en, fr],
}

describe('resolveLocaleFromRoute', () => {
  it('strips prefix to find locale (prefix_except_default)', () => {
    expect(resolveLocaleFromRoute('/fr/about', prefixExceptDefault)).toEqual({ locale: 'fr', basePath: '/about' })
  })

  it('uses defaultLocale when no prefix present (prefix_except_default)', () => {
    expect(resolveLocaleFromRoute('/about', prefixExceptDefault)).toEqual({ locale: 'en', basePath: '/about' })
  })

  it('handles bare root for non-default locale', () => {
    expect(resolveLocaleFromRoute('/fr', prefixExceptDefault)).toEqual({ locale: 'fr', basePath: '/' })
  })

  it('always returns defaultLocale for no_prefix strategy', () => {
    expect(resolveLocaleFromRoute('/fr/about', noPrefix)).toEqual({ locale: 'en', basePath: '/fr/about' })
  })

  it('treats unknown first segment as default-locale page', () => {
    expect(resolveLocaleFromRoute('/blog/post', prefixExceptDefault)).toEqual({ locale: 'en', basePath: '/blog/post' })
  })
})

describe('localePath', () => {
  it('omits prefix for default locale under prefix_except_default', () => {
    expect(localePath('/about', 'en', prefixExceptDefault)).toBe('/about')
  })

  it('adds prefix for non-default locale under prefix_except_default', () => {
    expect(localePath('/about', 'fr', prefixExceptDefault)).toBe('/fr/about')
  })

  it('always prefixes under prefix strategy', () => {
    expect(localePath('/about', 'en', prefixAll)).toBe('/en/about')
    expect(localePath('/about', 'fr', prefixAll)).toBe('/fr/about')
  })

  it('returns /<locale> for root under prefix strategies', () => {
    expect(localePath('/', 'fr', prefixExceptDefault)).toBe('/fr')
    expect(localePath('/', 'en', prefixAll)).toBe('/en')
  })

  it('passes through unchanged under no_prefix', () => {
    expect(localePath('/about', 'fr', noPrefix)).toBe('/about')
  })
})

describe('computeLocaleAlternates', () => {
  it('returns one alternate per configured locale with hreflang', () => {
    const alts = computeLocaleAlternates('/fr/about', prefixExceptDefault)
    expect(alts).toEqual([
      { code: 'en', hreflang: 'en', path: '/about' },
      { code: 'fr', hreflang: 'fr-FR', path: '/fr/about' },
    ])
  })

  it('produces alternates for default-locale routes', () => {
    const alts = computeLocaleAlternates('/about', prefixExceptDefault)
    expect(alts.map(a => a.path)).toEqual(['/about', '/fr/about'])
  })
})

describe('computeLocaleAlternates with translated routes', () => {
  const translated: RuntimeI18nConfig = {
    ...prefixExceptDefault,
    pages: {
      'about': { en: '/about', fr: '/a-propos' },
      'blog': { en: '/blog', fr: '/journal' },
      'blog-slug': { en: '/blog/[slug]', fr: '/journal/[slug]' },
      'docs-path': { en: '/docs/[...path]', fr: '/documentation/[...path]' },
      'legal': { en: '/legal', fr: false },
    },
  }

  it('uses the translated slug instead of prefixing the default one', () => {
    expect(computeLocaleAlternates('/about', translated)).toEqual([
      { code: 'en', hreflang: 'en', path: '/about' },
      { code: 'fr', hreflang: 'fr-FR', path: '/fr/a-propos' },
    ])
  })

  it('resolves back from a translated route to the default one', () => {
    expect(computeLocaleAlternates('/fr/a-propos', translated).map(a => a.path))
      .toEqual(['/about', '/fr/a-propos'])
  })

  it('carries dynamic params across locales', () => {
    expect(computeLocaleAlternates('/blog/hello-world', translated).map(a => a.path))
      .toEqual(['/blog/hello-world', '/fr/journal/hello-world'])
    expect(computeLocaleAlternates('/fr/journal/hello-world', translated).map(a => a.path))
      .toEqual(['/blog/hello-world', '/fr/journal/hello-world'])
  })

  it('carries catch-all params across locales', () => {
    expect(computeLocaleAlternates('/docs/guide/getting-started', translated).map(a => a.path))
      .toEqual(['/docs/guide/getting-started', '/fr/documentation/guide/getting-started'])
  })

  it('omits locales the page is disabled for', () => {
    expect(computeLocaleAlternates('/legal', translated)).toEqual([
      { code: 'en', hreflang: 'en', path: '/legal' },
    ])
  })

  it('does not confuse a listing route with its detail route', () => {
    expect(computeLocaleAlternates('/blog', translated).map(a => a.path))
      .toEqual(['/blog', '/fr/journal'])
  })

  it('falls back to prefixing for routes absent from the table', () => {
    expect(computeLocaleAlternates('/contact', translated).map(a => a.path))
      .toEqual(['/contact', '/fr/contact'])
  })

  it('falls back to prefixing when an entry omits a locale', () => {
    const partial: RuntimeI18nConfig = {
      ...prefixExceptDefault,
      pages: { about: { fr: '/a-propos' } },
    }
    expect(computeLocaleAlternates('/fr/a-propos', partial).map(a => a.path))
      .toEqual(['/a-propos', '/fr/a-propos'])
  })

  it('prefixes every locale under the prefix strategy', () => {
    const prefixed: RuntimeI18nConfig = {
      ...prefixAll,
      pages: { about: { en: '/about', fr: '/a-propos' } },
    }
    expect(computeLocaleAlternates('/en/about', prefixed).map(a => a.path))
      .toEqual(['/en/about', '/fr/a-propos'])
  })

  it('ignores the table under no_prefix, where each page has one URL', () => {
    const single: RuntimeI18nConfig = {
      ...noPrefix,
      pages: { about: { en: '/about', fr: '/a-propos' } },
    }
    expect(computeLocaleAlternates('/about', single).map(a => a.path))
      .toEqual(['/about', '/about'])
  })
})

describe('hasCjkLocale', () => {
  it('detects CJK locales by code prefix', () => {
    expect(hasCjkLocale({ ...prefixExceptDefault, locales: [en, ja] })).toBe(true)
    expect(hasCjkLocale({ ...prefixExceptDefault, locales: [en, { code: 'zh-CN', hreflang: 'zh-CN' }] })).toBe(true)
    expect(hasCjkLocale({ ...prefixExceptDefault, locales: [en, { code: 'ko', hreflang: 'ko' }] })).toBe(true)
  })

  it('returns false when no CJK locales present', () => {
    expect(hasCjkLocale(prefixExceptDefault)).toBe(false)
  })
})
