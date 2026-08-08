import type { AutoI18nConfig } from 'nuxtseo-shared/i18n'
import type { RuntimeI18nConfig } from '../runtime/server/utils/i18n'
import { resolveI18nConfig as resolveSharedI18nConfig } from 'nuxtseo-shared/i18n'
import { logger } from '../logger'

export type { RuntimeI18nConfig } from '../runtime/server/utils/i18n'
export type { AutoI18nConfig } from 'nuxtseo-shared/i18n'

/**
 * Runtime-safe i18n config: stripped of non-serializable LocaleObject extras.
 * Only carries what the runtime needs to resolve locale + alternates from a route.
 */
const CJK_PREFIXES = ['zh', 'ja', 'ko']

export function hasCjkLocale(i18n: RuntimeI18nConfig): boolean {
  return i18n.locales.some(l => CJK_PREFIXES.some(p => l.code.startsWith(p) || l.hreflang.startsWith(p)))
}

export function toRuntimeI18nConfig(auto: AutoI18nConfig): RuntimeI18nConfig {
  return {
    defaultLocale: auto.defaultLocale,
    strategy: auto.strategy,
    // Translated route paths. Without these the runtime can only guess
    // alternates by adding/removing a locale prefix, which is wrong for every
    // page whose slug differs per locale.
    ...(auto.pages && Object.keys(auto.pages).length ? { pages: auto.pages } : {}),
    locales: auto.locales.map((l) => {
      const raw = l as typeof l & { name?: string, nativeName?: string, language?: string }
      return {
        code: l.code,
        hreflang: l._hreflang || raw.language || l.code,
        name: raw.name,
        nativeName: raw.nativeName ?? raw.name,
      }
    }),
  }
}

/**
 * Detect @nuxtjs/i18n / nuxt-i18n-micro at build time.
 * Returns null when no i18n module is installed or autoI18n is disabled.
 */
export async function detectI18n(opts: { autoI18n?: boolean } = {}): Promise<RuntimeI18nConfig | null> {
  if (opts.autoI18n === false)
    return null

  const auto = await resolveSharedI18nConfig({ warn: msg => logger.warn(msg) })
  if (!auto)
    return null

  if (!auto.locales?.length) {
    logger.warn('[ai-ready] @nuxtjs/i18n detected but no locales configured. i18n integration disabled.')
    return null
  }

  logger.debug(`[ai-ready] i18n detected: ${auto.locales.length} locales, strategy=${auto.strategy}, default=${auto.defaultLocale}`)
  return toRuntimeI18nConfig(auto)
}
