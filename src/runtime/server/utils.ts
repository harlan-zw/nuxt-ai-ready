import type { ContentNegotiationResult } from '@mdream/js/negotiate'
import type { H3Event } from 'h3'
import type { MdreamOptions } from 'mdream'
import type { ModulePublicRuntimeConfig } from '../../module'
import type { MarkdownContext } from '../types'
import { negotiateContent } from '@mdream/js/negotiate'
import { getBotInfo } from '@nuxtjs/robots/util'
import { getHeader, getHeaders } from 'h3'
import { htmlToMarkdown } from 'mdream'
import { useNitroApp } from 'nitropack/runtime'

export { toMarkdownPath } from '../markdown-path'

const RE_NBSP = /\u00A0/g

// Replace NBSP (U+00A0) with regular spaces to avoid encoding display issues
function normalizeWhitespace(text: string): string {
  return text.replace(RE_NBSP, ' ')
}

interface ExtractedMeta {
  title: string
  description: string
  metaKeywords: string
  headings: Array<Record<string, string>>
  updatedAt?: string
  textContent: string[]
}

// Build mdream options with extraction plugin
function buildMdreamOptions(
  url: string,
  mdreamOptions: ModulePublicRuntimeConfig['mdreamOptions'],
  meta: ExtractedMeta,
  extractUpdatedAt: boolean,
  additionalFields: Record<string, string>,
): MdreamOptions {
  // title and description come from mdream's frontmatter callback below; the
  // extraction selectors below sometimes fire with empty textContent and would
  // clobber the values, so we don't register them here.
  const extraction: MdreamOptions['extraction'] = {
    'meta[name="keywords"]': (el) => { meta.metaKeywords = el.attributes.content || '' },
    'h1, h2, h3, h4, h5, h6': (el) => {
      const text = el.textContent?.trim()
      if (text)
        meta.headings.push({ [el.tagName.toLowerCase()]: text })
    },
    'p, li, td, th, blockquote, figcaption': (el) => {
      const text = el.textContent?.trim()
      if (text)
        meta.textContent.push(text)
    },
    ...(extractUpdatedAt && {
      'meta[property="article:modified_time"], meta[name="last-modified"], meta[name="updated"], meta[property="og:updated_time"], meta[name="lastmod"]': (el) => {
        if (!meta.updatedAt && el.attributes.content)
          meta.updatedAt = el.attributes.content
      },
    }),
  }

  // Pair mdream's `additionalFields` with `onExtract` so the engine owns the
  // YAML emission while still surfacing extracted data back to us. The
  // additional fields land at the root of the frontmatter, where Vercel's
  // agent-readability audit looks for canonical_url and last_updated.
  const frontmatter: MdreamOptions['frontmatter'] = {
    additionalFields,
    onExtract: (fm) => {
      if (fm.title)
        meta.title = fm.title
      if (fm.description)
        meta.description = fm.description
    },
  }

  // Use just the origin (not full URL) so absolute paths like /docs/foo resolve correctly
  const origin = new URL(url).origin
  return {
    origin,
    ...mdreamOptions,
    frontmatter,
    extraction: { ...extraction, ...mdreamOptions?.extraction },
  }
}

// H3 wrapper over @mdream/js/negotiate that layers AI bot detection (via
// @nuxtjs/robots) on top of RFC 7231 Accept header negotiation. AI bots get
// markdown regardless of what their Accept header says.
export function negotiateRepresentation(event: H3Event): ContentNegotiationResult {
  // Nitro prerender requests must always resolve to HTML. Negotiating them to
  // markdown makes the middleware 307 redirect the route to its `.md` twin, and
  // Nitro bakes that redirect's meta-refresh stub into the canonical
  // `index.html`, destroying the prerendered page (issue #36). `import.meta.prerender`
  // covers the whole prerender bundle; the `x-nitro-prerender` header is the
  // per-request signal carried even when the constant isn't inlined.
  if (import.meta.prerender || getHeader(event, 'x-nitro-prerender'))
    return 'html'

  const accept = getHeader(event, 'accept')
  const secFetchDest = getHeader(event, 'sec-fetch-dest')

  // Honor a direct markdown preference
  if (negotiateContent(accept) === 'markdown')
    return 'markdown'

  // Browser navigation always gets HTML (short-circuit before bot check so
  // AI-categorized browsers don't get markdown pushed at them mid-navigation)
  if (secFetchDest === 'document')
    return 'html'

  // AI bots always get markdown regardless of Accept
  const botInfo = getBotInfo(getHeaders(event))
  if (botInfo?.category === 'ai')
    return 'markdown'

  return negotiateContent(accept, secFetchDest)
}

// Check if request should be rendered as markdown
// Returns normalized path, whether it's explicit (.md) or implicit (Accept header),
// or 'not-acceptable' if the Accept header cannot be satisfied.
export type MarkdownRequestMode
  = | { _tag: 'runtime', contentNegotiation: boolean }
    | { _tag: 'prerender' }

export function getMarkdownRenderInfo(
  event: H3Event,
  mode: MarkdownRequestMode = { _tag: 'runtime', contentNegotiation: true },
):
  | { path: string, isExplicit: boolean, negotiation: ContentNegotiationResult }
  | { notAcceptable: true }
  | null {
  const originalPath = event.path
  const isPrerender = mode._tag === 'prerender'

  // Never run on API routes or internal routes
  if (originalPath.startsWith('/api') || originalPath.startsWith('/_') || originalPath.startsWith('/@')) {
    return null
  }

  // Step aside for unambiguous non-document Accept headers (MCP/SSE/JSON RPCs).
  // If the client asks for application/json or text/event-stream and never
  // text/html|markdown|plain, this middleware has nothing to offer; the
  // underlying handler should respond instead of being hijacked with a 406.
  // Synthetic probes / unknown media types still 406 below to preserve the
  // RFC 7231 contract for content negotiation against document URLs.
  const accept = getHeader(event, 'accept') || ''
  if (!originalPath.endsWith('.md') && accept
    && /\b(?:application\/json|text\/event-stream)\b/i.test(accept)
    && !/text\/(?:html|markdown|plain)\b|\*\/\*/i.test(accept)) {
    return null
  }

  const isExplicit = originalPath.endsWith('.md')

  // For explicitOnly mode (prerender), only handle .md requests
  if (isPrerender && !isExplicit) {
    return null
  }

  // Extract file extension
  const lastSegment = originalPath.split('/').pop() || ''
  const hasExtension = lastSegment.includes('.')
  const extension = hasExtension ? lastSegment.substring(lastSegment.lastIndexOf('.')) : ''

  // Skip non-.md extensions
  if (hasExtension && extension !== '.md') {
    return null
  }

  const negotiation: ContentNegotiationResult = isPrerender
    ? 'markdown'
    : mode.contentNegotiation
      ? negotiateRepresentation(event)
      : 'html'

  // Explicit .md always serves markdown regardless of Accept
  if (isExplicit) {
    const path = normalizePath(originalPath.slice(0, -3))
    return { path, isExplicit: true, negotiation: 'markdown' }
  }

  if (negotiation === 'not-acceptable')
    return { notAcceptable: true }

  return { path: normalizePath(originalPath), isExplicit: false, negotiation }
}

function normalizePath(path: string): string {
  if (path.endsWith('/index'))
    return path.slice(0, -5) || '/'
  return path
}

// Back-compat: detect if client prefers markdown
export function clientPrefersMarkdown(event: H3Event): boolean {
  return negotiateRepresentation(event) === 'markdown'
}

// Pull the most recent `last_updated` candidate from the HTML head. Used to
// populate mdream's `additionalFields` before conversion (mdream's extraction
// callbacks fire mid-conversion, too late to feed back into additionalFields).
const RE_META_TAG = /<meta\b[^>]*>/gi
const RE_META_KEY = /(?:property|name)=["']([^"']+)["']/i
const RE_META_CONTENT = /content=["']([^"']*)["']/i
const UPDATED_META_KEYS = new Set([
  'article:modified_time',
  'og:updated_time',
  'last-modified',
  'lastmod',
  'updated',
])
export function extractLastUpdated(html: string): string | undefined {
  RE_META_TAG.lastIndex = 0
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = RE_META_TAG.exec(html)) !== null) {
    const tag = m[0]
    const key = RE_META_KEY.exec(tag)?.[1]
    if (!key || !UPDATED_META_KEYS.has(key))
      continue
    const content = RE_META_CONTENT.exec(tag)?.[1]
    if (content)
      return content
  }
  return undefined
}

interface ConvertHtmlOptions {
  /** Extract updatedAt from meta tags */
  extractUpdatedAt?: boolean
  /** Call runtime hooks (ai-ready:mdreamConfig, ai-ready:page:markdown) */
  hooks?: { route: string, event: H3Event }
  /** Extra fields to inject at the root of mdream's emitted YAML frontmatter */
  additionalFrontmatter?: Record<string, string>
}

// Convert HTML to Markdown with optional hooks and updatedAt extraction
export async function convertHtmlToMarkdown(
  html: string,
  url: string,
  mdreamOptions: ModulePublicRuntimeConfig['mdreamOptions'],
  opts: ConvertHtmlOptions = {},
) {
  const meta: ExtractedMeta = { title: '', description: '', metaKeywords: '', headings: [], textContent: [] }
  const options = buildMdreamOptions(url, mdreamOptions, meta, opts.extractUpdatedAt ?? false, opts.additionalFrontmatter ?? {})

  let markdown: string
  if (opts.hooks) {
    const nitroApp = useNitroApp()
    await nitroApp.hooks.callHook('ai-ready:mdreamConfig', options)

    const context: MarkdownContext = {
      html,
      markdown: htmlToMarkdown(html, options),
      route: opts.hooks.route,
      title: meta.title,
      description: meta.description,
      isPrerender: false,
      event: opts.hooks.event,
    }
    await nitroApp.hooks.callHook('ai-ready:page:markdown', context)
    markdown = context.markdown
  }
  else {
    markdown = htmlToMarkdown(html, options)
  }

  return {
    markdown: normalizeWhitespace(markdown),
    title: normalizeWhitespace(meta.title),
    description: normalizeWhitespace(meta.description),
    headings: meta.headings,
    metaKeywords: meta.metaKeywords,
    textContent: meta.textContent.join(' '),
    ...(meta.updatedAt && { updatedAt: meta.updatedAt }),
  }
}
