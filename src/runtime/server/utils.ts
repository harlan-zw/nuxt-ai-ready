import type { MdreamOptions } from 'mdream'
import type { H3Event } from '#nuxtseo/h3'
import type { MarkdownContext, ModuleOptions } from '../types'
import { htmlToMarkdown } from 'mdream'
import { useNitroApp } from '#nuxtseo/nitro'

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
  mdreamOptions: ModuleOptions['mdreamOptions'],
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
  mdreamOptions: ModuleOptions['mdreamOptions'],
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
