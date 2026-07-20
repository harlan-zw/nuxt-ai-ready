import type { ModulePublicRuntimeConfig } from '../../../module'
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
  config: ModulePublicRuntimeConfig,
  resolveUrl?: LinkUrlResolver,
): string {
  const parts: string[] = []
  if (variant === 'html') {
    const href = resolveHeaderUrl(toMarkdownPath(path), resolveUrl)
    parts.push(`<${encodePathForHeader(href)}>; rel="alternate"; type="text/markdown"`)
  }
  else {
    const href = resolveHeaderUrl(path, resolveUrl)
    parts.push(`<${encodePathForHeader(href)}>; rel="alternate"; type="text/html"`)
  }

  if (config.i18n) {
    const alternates = computeLocaleAlternates(path, config.i18n)
    for (const alt of alternates) {
      const href = variant === 'markdown' ? toMarkdownPath(alt.path) : alt.path
      parts.push(`<${encodePathForHeader(resolveHeaderUrl(href, resolveUrl))}>; rel="alternate"; hreflang="${alt.hreflang}"`)
    }
  }
  return parts.join(', ')
}
