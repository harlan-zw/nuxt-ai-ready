import type { AutoI18nConfig } from 'nuxtseo-shared/i18n'
import type { RuntimeI18nConfig } from 'nuxtseo-shared/i18n-runtime'
import { resolveI18nConfig as resolveSharedI18nConfig, toRuntimeI18nConfig as toSharedRuntimeI18nConfig } from 'nuxtseo-shared/i18n'
import { logger } from '../logger'

export type { AutoI18nConfig } from 'nuxtseo-shared/i18n'
export type { RuntimeI18nConfig } from 'nuxtseo-shared/i18n-runtime'

const CJK_PREFIXES = ['zh', 'ja', 'ko']

export interface I18nPageRoute {
  name?: string
  path: string
  children?: I18nPageRoute[]
}

export function hasCjkLocale(i18n: RuntimeI18nConfig): boolean {
  return i18n.locales.some(l => CJK_PREFIXES.some(p => l.code.startsWith(p) || l.hreflang.startsWith(p)))
}

function resolvePagePath(parentPath: string, routePath: string): string {
  const normalizedRoutePath = routePath.replace(/:(\w+)\(\)/g, '[$1]')
  if (normalizedRoutePath.startsWith('/'))
    return normalizedRoutePath
  if (!normalizedRoutePath)
    return parentPath || '/'
  return `${parentPath === '/' ? '' : parentPath.replace(/\/$/, '')}/${normalizedRoutePath}`
}

function collectPagePaths(routes: readonly I18nPageRoute[], parentPath = ''): Map<string, string> {
  return routes.reduce((paths, route) => {
    const path = resolvePagePath(parentPath, route.path)
    if (route.name)
      paths.set(route.name, path)
    if (route.children?.length) {
      for (const [name, childPath] of collectPagePaths(route.children, path))
        paths.set(name, childPath)
    }
    return paths
  }, new Map<string, string>())
}

export function materializeI18nPages(
  i18n: Pick<RuntimeI18nConfig, 'defaultLocale' | 'locales' | 'pages'>,
  routes: readonly I18nPageRoute[],
): RuntimeI18nConfig['pages'] {
  if (!i18n.pages)
    return undefined

  const pagePaths = collectPagePaths(routes)
  return Object.fromEntries(Object.entries(i18n.pages).map(([pageName, pageLocales]) => {
    const defaultPath = pageLocales?.[i18n.defaultLocale]
    const fallbackPath = typeof defaultPath === 'string' ? defaultPath : pagePaths.get(pageName)
    const locales = Object.fromEntries(i18n.locales.flatMap((locale) => {
      const configuredPath = pageLocales?.[locale.code]
      if (configuredPath !== undefined)
        return [[locale.code, configuredPath]]
      return fallbackPath === undefined ? [] : [[locale.code, fallbackPath]]
    }))
    return [pageName, locales]
  }))
}

export function toRuntimeI18nConfig(auto: AutoI18nConfig, routes: readonly I18nPageRoute[] = []): RuntimeI18nConfig {
  const runtime = toSharedRuntimeI18nConfig(auto)
  if (!runtime.pages || !routes.length)
    return runtime

  return { ...runtime, pages: materializeI18nPages(runtime, routes) }
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
