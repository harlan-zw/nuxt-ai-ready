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

/** Build the request-specific links shared by success and error responses. */
function buildBaseParts(
  path: string,
  variant: 'html' | 'markdown',
  config: LinkHeaderConfig,
  resolveUrl?: LinkUrlResolver,
): string[] {
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

  return parts
}

function appendLocaleParts(
  parts: string[],
  path: string,
  variant: 'html' | 'markdown',
  config: LinkHeaderConfig,
  resolveUrl: LinkUrlResolver | undefined,
  routeContext: RuntimeRouteContext,
) {
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
}

function appendCatalogPart(parts: string[], config: LinkHeaderConfig) {
  if (config.apiCatalog) {
    const catalog = `<${encodePathForHeader(config.apiCatalog.href)}>; rel="api-catalog"`
    parts.push(catalog)
    return catalog
  }
}

export function buildLinkHeader(
  path: string,
  variant: 'html' | 'markdown',
  config: LinkHeaderConfig,
  resolveUrl?: LinkUrlResolver,
  routeContext: RuntimeRouteContext = {},
): string {
  const parts = buildBaseParts(path, variant, config, resolveUrl)
  appendLocaleParts(parts, path, variant, config, resolveUrl, routeContext)
  appendCatalogPart(parts, config)
  return parts.join(', ')
}

/** Resolve request-specific URLs once for both success and error responses. */
export function buildStatusAwareLinkHeaders(
  path: string,
  variant: 'html' | 'markdown',
  config: LinkHeaderConfig,
  resolveUrl?: LinkUrlResolver,
  routeContext: RuntimeRouteContext = {},
): { error: string, success: string } {
  const parts = buildBaseParts(path, variant, config, resolveUrl)
  const safeParts = parts.slice()
  const catalog = appendCatalogPart(safeParts, config)
  const error = safeParts.join(', ')
  if (!config.i18n)
    return { error, success: error }

  appendLocaleParts(parts, path, variant, config, resolveUrl, routeContext)
  if (catalog)
    parts.push(catalog)
  return { error, success: parts.join(', ') }
}
