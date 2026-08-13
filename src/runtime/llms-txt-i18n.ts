import type { RuntimeI18nConfig, RuntimeRouteContext } from './server/utils/i18n'
import { resolveLocaleAlternateUrl } from './i18n-url'
import { formatLlmsTxtPageLink } from './llms-txt-format'
import { computeLocaleAlternates, localePath } from './server/utils/i18n'

export { resolveLocaleFromRoute } from './server/utils/i18n'

export function formatAvailableLanguagesSection(
  i18n: RuntimeI18nConfig,
  pageCounts: Map<string, number>,
  resolveHref: (pathname: string) => string = pathname => pathname,
  routeContext: RuntimeRouteContext = {},
): string[] {
  const lines: string[] = ['## Available Languages on Website', '']
  const rootAlternates = new Map(computeLocaleAlternates('/', i18n, routeContext).map(alternate => [alternate.code, alternate]))
  for (const locale of i18n.locales) {
    const isDefault = locale.code === i18n.defaultLocale
    const alternate = rootAlternates.get(locale.code)
    const prefix = alternate?.path ?? localePath('/', locale.code, i18n, routeContext)
    const resolvedPath = resolveHref(prefix)
    const href = alternate
      ? resolveLocaleAlternateUrl({ ...alternate, path: resolvedPath }, candidate => candidate)
      : resolvedPath
    const count = pageCounts.get(locale.code) ?? 0
    const display = locale.nativeName
      ? `${locale.nativeName} (${locale.code})`
      : locale.name
        ? `${locale.name} (${locale.code})`
        : locale.code
    const suffix = isDefault ? 'content included below' : 'visit this language for content'
    lines.push(formatLlmsTxtPageLink({
      pathname: href,
      title: display,
      href,
      description: `${count} pages; ${suffix}.`,
    }))
  }
  return lines
}
