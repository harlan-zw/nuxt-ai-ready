import type { RuntimeI18nConfig } from 'nuxtseo-shared/i18n-runtime'

export {
  computeLocaleAlternates,
  localePath,
  resolveLocaleAlternates,
  resolveLocaleFromRoute,
} from '#ai-ready-virtual/i18n-runtime.mjs'

export type {
  LocaleAlternate,
  LocaleAlternateResolution,
  LocalePages,
  RouteLocaleInfo,
  RuntimeI18nConfig,
  RuntimeLocale,
  RuntimeRouteContext,
} from 'nuxtseo-shared/i18n-runtime'

/** Get the runtime i18n config from runtimeConfig, or null when disabled. */
export function getRuntimeI18n(aiReadyConfig: { i18n?: RuntimeI18nConfig | null }): RuntimeI18nConfig | null {
  return aiReadyConfig.i18n || null
}

/** Normalize a host or URL into a comparable hostname (lowercase, no scheme, no path). */
export function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^[a-z][a-z\d+.-]*:\/\//, '').split('/')[0]!
}

/** True when the host equals a domain configured on any i18n locale. */
export function hostMatchesLocaleDomain(host: string | undefined, i18n: RuntimeI18nConfig): boolean {
  if (!host)
    return false
  const normalized = normalizeHost(host)
  if (!normalized)
    return false
  return i18n.locales.some(locale =>
    [...locale.domains ?? [], locale.domain, ...(locale.defaultForDomains ?? [])]
      .some(domain => domain && normalizeHost(domain) === normalized),
  )
}
