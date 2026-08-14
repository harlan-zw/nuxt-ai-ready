import type { LocaleAlternate } from 'nuxtseo-shared/i18n-runtime'

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
