import type { LocaleAlternate, RuntimeI18nConfig } from 'nuxtseo-shared/i18n-runtime'

export {
  computeLocaleAlternates,
  localePath,
  resolveLocaleAlternates,
  resolveLocaleFromRoute,
} from 'nuxtseo-shared/i18n-runtime'

export type {
  LocaleAlternate,
  LocaleAlternateResolution,
  LocalePages,
  RouteLocaleInfo,
  RuntimeI18nConfig,
  RuntimeLocale,
  RuntimeRouteContext,
} from 'nuxtseo-shared/i18n-runtime'

/** Resolve a locale alternate against its configured domain or the current site. */
export function resolveLocaleAlternateUrl(
  alternate: Pick<LocaleAlternate, 'domain' | 'path'>,
  resolveUrl: (path: string) => string,
): string {
  const resolved = resolveUrl(alternate.path)
  if (!alternate.domain)
    return resolved

  const origin = /^[a-z][a-z\d+.-]*:\/\//i.test(alternate.domain)
    ? alternate.domain
    : `https://${alternate.domain}`
  const deployed = new URL(resolved, 'http://nuxtseo.local')
  return new URL(`${deployed.pathname}${deployed.search}${deployed.hash}`, origin).href
}

/** Get the runtime i18n config from runtimeConfig, or null when disabled. */
export function getRuntimeI18n(aiReadyConfig: { i18n?: RuntimeI18nConfig | null }): RuntimeI18nConfig | null {
  return aiReadyConfig.i18n || null
}
