import type { RuntimeI18nConfig, RuntimeRouteContext } from './i18n'
import { resolveLocaleAlternateUrl } from '../../i18n-url'
import { toMarkdownPath } from '../../markdown-path'
import { computeLocaleAlternates } from './i18n'

/**
 * Encode a URL path for safe inclusion in an HTTP header value.
 * HTTP header values must be ASCII-only per RFC 9110 §5.5, so paths containing
 * non-Latin characters (e.g. Chinese, Cyrillic) must be percent-encoded or
 * Cloudflare (and other RFC-compliant runtimes) will reject the header.
 * `encodeURI` preserves `/` separators and other reserved URL characters.
 */
export function encodePathForHeader(path: string): string {
  return encodeURI(path)
}

type LinkUrlResolver = (path: string) => string

export const LLMS_TXT_PATH = '/llms.txt'

interface LinkHeaderConfig {
  apiCatalog?: { href: string }
  describedby?: boolean
  i18n?: RuntimeI18nConfig | null
}

function resolveHeaderUrl(path: string, resolveUrl?: LinkUrlResolver): string {
  if (!resolveUrl)
    return path
  try {
    return resolveUrl(path)
  }
  catch {
    return path
  }
}

/**
 * Build a comma-joined Link header value with the standard alternates plus i18n hreflang variants.
 */
export function buildLinkHeader(
  path: string,
  variant: 'html' | 'markdown',
  config: LinkHeaderConfig,
  resolveUrl?: LinkUrlResolver,
  routeContext: RuntimeRouteContext = {},
): string {
  const parts: string[] = []
  if (variant === 'html') {
    const href = resolveHeaderUrl(toMarkdownPath(path), resolveUrl)
    parts.push(`<${encodePathForHeader(href)}>; rel="alternate"; type="text/markdown"`)
  }
  else {
    const href = resolveHeaderUrl(path, resolveUrl)
    parts.push(`<${encodePathForHeader(href)}>; rel="alternate"; type="text/html"`)
    parts.push(`<${encodePathForHeader(href)}>; rel="canonical"`)
  }

  if (config.describedby !== false) {
    const href = resolveHeaderUrl(LLMS_TXT_PATH, resolveUrl)
    parts.push(`<${encodePathForHeader(href)}>; rel="describedby"`)
  }

  if (config.i18n) {
    const alternates = computeLocaleAlternates(path, config.i18n, routeContext)
    for (const alt of alternates) {
      const alternatePath = variant === 'markdown' ? toMarkdownPath(alt.path) : alt.path
      const href = resolveLocaleAlternateUrl(
        { ...alt, path: alternatePath },
        candidate => resolveHeaderUrl(candidate, resolveUrl),
      )
      parts.push(`<${encodePathForHeader(href)}>; rel="alternate"; hreflang="${alt.hreflang}"`)
    }
  }
  if (config.apiCatalog) {
    parts.push(`<${encodePathForHeader(config.apiCatalog.href)}>; rel="api-catalog"`)
  }
  return parts.join(', ')
}
