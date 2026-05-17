import type { ModulePublicRuntimeConfig } from '../../../module'
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

// Map a clean route to its markdown twin. Inlined from ../utils to keep this
// module free of h3/nitro imports so it stays unit-testable.
function toMarkdownPath(path: string): string {
  if (path === '/' || path.endsWith('/'))
    return `${path}index.md`
  return `${path}.md`
}

/**
 * Build a comma-joined Link header value with the standard alternates plus i18n hreflang variants.
 */
export function buildLinkHeader(
  path: string,
  variant: 'html' | 'markdown',
  config: ModulePublicRuntimeConfig,
): string {
  const parts: string[] = []
  if (variant === 'html') {
    parts.push(`<${encodePathForHeader(toMarkdownPath(path))}>; rel="alternate"; type="text/markdown"`)
  }
  else {
    parts.push(`<${encodePathForHeader(path)}>; rel="alternate"; type="text/html"`)
  }

  if (config.i18n) {
    const alternates = computeLocaleAlternates(path, config.i18n)
    for (const alt of alternates) {
      const href = variant === 'markdown' ? toMarkdownPath(alt.path) : alt.path
      parts.push(`<${encodePathForHeader(href)}>; rel="alternate"; hreflang="${alt.hreflang}"`)
    }
  }
  return parts.join(', ')
}
