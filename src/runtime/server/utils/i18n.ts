/** Runtime-safe subset used for route locale resolution. */
export interface RuntimeI18nConfig {
  defaultLocale: string
  strategy: 'no_prefix' | 'prefix_except_default' | 'prefix' | 'prefix_and_default'
  locales: Array<{
    code: string
    hreflang: string
    name?: string
    nativeName?: string
  }>
}

export interface LocaleAlternate {
  code: string
  hreflang: string
  path: string
}

export interface RouteLocaleInfo {
  /** Resolved locale code for this route */
  locale: string
  /** Route with locale prefix stripped (e.g. /fr/about → /about). For no_prefix this equals route. */
  basePath: string
}

/**
 * Resolve which locale a route belongs to and the locale-stripped base path.
 */
export function resolveLocaleFromRoute(route: string, i18n: RuntimeI18nConfig): RouteLocaleInfo {
  if (i18n.strategy === 'no_prefix')
    return { locale: i18n.defaultLocale, basePath: route }

  const segments = route.split('/').filter(Boolean)
  const first = segments[0]
  const matched = first ? i18n.locales.find(l => l.code === first) : undefined

  if (matched) {
    const rest = segments.slice(1).join('/')
    return { locale: matched.code, basePath: rest ? `/${rest}` : '/' }
  }

  return { locale: i18n.defaultLocale, basePath: route }
}

/**
 * Build the URL path for a base path under a given locale, honoring the i18n strategy.
 */
export function localePath(basePath: string, locale: string, i18n: RuntimeI18nConfig): string {
  if (i18n.strategy === 'no_prefix')
    return basePath

  const isDefault = locale === i18n.defaultLocale
  if (i18n.strategy === 'prefix_except_default' && isDefault)
    return basePath

  // prefix, prefix_and_default, prefix_except_default (non-default)
  if (basePath === '/' || basePath === '')
    return `/${locale}`
  return `/${locale}${basePath}`
}

/**
 * Compute hreflang alternates for a given route.
 * Returns the route itself plus all sibling locale variants.
 */
export function computeLocaleAlternates(route: string, i18n: RuntimeI18nConfig): LocaleAlternate[] {
  const { basePath } = resolveLocaleFromRoute(route, i18n)
  return i18n.locales.map(l => ({
    code: l.code,
    hreflang: l.hreflang || l.code,
    path: localePath(basePath, l.code, i18n),
  }))
}

/**
 * Get the runtime i18n config from runtimeConfig (or null if disabled).
 */
export function getRuntimeI18n(aiReadyConfig: { i18n?: RuntimeI18nConfig | null }): RuntimeI18nConfig | null {
  return aiReadyConfig.i18n || null
}
