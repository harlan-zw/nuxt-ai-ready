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
