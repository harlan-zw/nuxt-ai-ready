import type { RuntimeI18nConfig } from '../../src/runtime/server/utils/i18n'
import { describe, expect, it } from 'vitest'
import { computeLocaleAlternates, localePath, resolveLocaleAlternateUrl, resolveLocaleFromRoute } from '../../src/runtime/server/utils/i18n'
import { hasCjkLocale, toRuntimeI18nConfig } from '../../src/utils/i18n'

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

describe('resolveLocaleAlternateUrl', () => {
  it('keeps the deployed base path when switching locale domains', () => {
    expect(resolveLocaleAlternateUrl(
      { domain: 'fr.example.com', path: '/fr/about?view=full' },
      path => new URL(`/docs${path}`, 'https://en.example.com').href,
    )).toBe('https://fr.example.com/docs/fr/about?view=full')
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

  it('does not fabricate alternates for locales omitted from a translated entry', () => {
    const partial: RuntimeI18nConfig = {
      ...prefixExceptDefault,
      pages: { about: { fr: '/a-propos' } },
    }
    expect(computeLocaleAlternates('/fr/a-propos', partial).map(a => a.path))
      .toEqual(['/fr/a-propos'])
  })

  it('keeps translations for the locales an entry does name', () => {
    const partial: RuntimeI18nConfig = {
      ...prefixExceptDefault,
      locales: [en, fr, { code: 'de', hreflang: 'de-DE' }],
      pages: { about: { en: '/about', fr: '/a-propos' } },
    }
    // `de` is untranslated, so it keeps the default locale's path rather than
    // the requested `/a-propos`, which exists only under `fr`.
    expect(computeLocaleAlternates('/fr/a-propos', partial).map(a => a.path))
      .toEqual(['/about', '/fr/a-propos', '/de/about'])
  })

  it('prefers a static entry over a dynamic one regardless of declaration order', () => {
    const shadowed: RuntimeI18nConfig = {
      ...prefixExceptDefault,
      pages: {
        slug: { en: '/[slug]', fr: '/[slug]' },
        about: { en: '/about', fr: '/a-propos' },
      },
    }
    expect(computeLocaleAlternates('/about', shadowed).map(a => a.path))
      .toEqual(['/about', '/fr/a-propos'])
  })

  it('prefers a static entry over a catch-all declared before it', () => {
    const shadowed: RuntimeI18nConfig = {
      ...prefixExceptDefault,
      pages: {
        path: { en: '/[...path]', fr: '/[...path]' },
        about: { en: '/about', fr: '/a-propos' },
      },
    }
    expect(computeLocaleAlternates('/about', shadowed).map(a => a.path))
      .toEqual(['/about', '/fr/a-propos'])
  })

  it('prefers a dynamic segment over a catch-all at the same depth', () => {
    const ranked: RuntimeI18nConfig = {
      ...prefixExceptDefault,
      pages: {
        'docs-path': { en: '/docs/[...path]', fr: '/documentation/[...path]' },
        'docs-slug': { en: '/docs/[slug]', fr: '/doc/[slug]' },
      },
    }
    expect(computeLocaleAlternates('/docs/intro', ranked).map(a => a.path))
      .toEqual(['/docs/intro', '/fr/doc/intro'])
    expect(computeLocaleAlternates('/docs/guide/intro', ranked).map(a => a.path))
      .toEqual(['/docs/guide/intro', '/fr/documentation/guide/intro'])
  })

  it('carries optional params across locales', () => {
    const optional: RuntimeI18nConfig = {
      ...prefixExceptDefault,
      pages: { 'blog-slug': { en: '/blog/[[slug]]', fr: '/journal/[[slug]]' } },
    }
    expect(computeLocaleAlternates('/blog/hello', optional).map(a => a.path))
      .toEqual(['/blog/hello', '/fr/journal/hello'])
    expect(computeLocaleAlternates('/blog', optional).map(a => a.path))
      .toEqual(['/blog', '/fr/journal'])
  })

  it('carries params embedded in static segments across locales', () => {
    const mixed: RuntimeI18nConfig = {
      ...prefixExceptDefault,
      pages: { product: { en: '/products/product-[id]', fr: '/produits/produit-[id]' } },
    }
    expect(computeLocaleAlternates('/products/product-42', mixed).map(a => a.path))
      .toEqual(['/products/product-42', '/fr/produits/produit-42'])
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

describe('toRuntimeI18nConfig', () => {
  it('keeps the domain metadata needed by runtime locale resolution', () => {
    const config = toRuntimeI18nConfig({
      defaultLocale: 'en',
      strategy: 'prefix_and_default',
      differentDomains: true,
      locales: [
        { code: 'en', _hreflang: 'en', _sitemap: 'en', domain: 'en.example.com' },
        { code: 'fr', _hreflang: 'fr-FR', _sitemap: 'fr', domain: 'fr.example.com' },
      ],
    })

    expect(config).toMatchObject({
      differentDomains: true,
      locales: [
        { code: 'en', domain: 'en.example.com' },
        { code: 'fr', domain: 'fr.example.com' },
      ],
    })
  })
})
