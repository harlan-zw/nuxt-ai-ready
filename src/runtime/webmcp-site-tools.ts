import type { WebMcpTool, WebMcpToolResult } from './webmcp'
import { toMarkdownPath } from './markdown-path'
import { toolError, toolText, truncateToolOutput, WEB_MCP_BUDGET } from './webmcp'

export interface SiteToolsOptions {
  /** Characters a single tool response may return before truncation. */
  maxOutputChars?: number
  /** Results returned by `search_pages` when the agent does not ask for a count. */
  searchLimit?: number
}

interface PageSummary {
  route: string
  title?: string
  description?: string
  headings?: string
  keywords?: string[]
}

interface PagesResponse {
  pages?: PageSummary[]
  results?: PageSummary[]
  total?: number
}

/** Page content is whatever the site indexed, so treat it as untrusted input. */
const READ_ONLY = { readOnlyHint: true, untrustedContentHint: true }

const RE_LEADING_SLASHES = /^\/+/
const RE_MARKDOWN_SUFFIX = /\.md$/
const RE_WHITESPACE = /\s+/

/** Field weights mirroring the BM25 weights the server-side FTS query uses. */
const SEARCH_WEIGHTS: Array<[keyof PageSummary, number]> = [
  ['title', 3],
  ['route', 2],
  ['keywords', 2],
  ['headings', 1],
  ['description', 1],
]

/**
 * Rank the prerendered index in the browser. Only reached on fully static
 * deployments, where there is no server left to run the FTS query.
 */
function searchIndex(pages: PageSummary[], query: string, limit: number): PageSummary[] {
  const terms = query.toLowerCase().split(RE_WHITESPACE).filter(Boolean)
  if (!terms.length)
    return []

  return pages
    .map((page) => {
      let score = 0
      for (const [field, weight] of SEARCH_WEIGHTS) {
        const value = page[field]
        const haystack = (Array.isArray(value) ? value.join(' ') : value || '').toLowerCase()
        for (const term of terms) {
          if (haystack.includes(term))
            score += weight
        }
      }
      return { page, score }
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => entry.page)
}

/**
 * Coerce whatever the agent passed into a site route. Schemas stay loose so the
 * model is not penalised for sending `about` or `/about.md` instead of `/about`.
 */
function normalizeRoute(input: unknown): string | undefined {
  const value = String(input ?? '').trim()
  if (!value || value.includes('://'))
    return undefined
  return `/${value.replace(RE_LEADING_SLASHES, '').replace(RE_MARKDOWN_SUFFIX, '')}`
}

function clamp(input: unknown, fallback: number, max: number): number {
  const value = Math.trunc(Number(input))
  if (!Number.isFinite(value) || value < 1)
    return fallback
  return Math.min(value, max)
}

/**
 * Read-only tools mirroring the MCP server, so an agent running inside the
 * browser can discover and read site content without leaving the page.
 */
export function createSiteTools(options: SiteToolsOptions = {}): WebMcpTool[] {
  const maxOutputChars = options.maxOutputChars ?? WEB_MCP_BUDGET.output
  const searchLimit = options.searchLimit ?? 10

  /**
   * One page per line rather than JSON, so trimming to the output budget drops
   * whole entries instead of leaving the agent with a half-parsed blob.
   */
  function formatPages(pages: PageSummary[], summary: string): WebMcpToolResult {
    const lines: string[] = []
    let used = summary.length
    let omitted = 0

    for (const [index, page] of pages.entries()) {
      const line = `\n${[page.route, page.title, page.description].filter(Boolean).join(' | ')}`
      if (maxOutputChars > 0 && used + line.length > maxOutputChars) {
        omitted = pages.length - index
        break
      }
      used += line.length
      lines.push(line)
    }

    const note = omitted ? ` ${omitted} left out to fit, narrow the query or page through with offset.` : ''
    return toolText(`${summary}${note}${lines.join('')}`)
  }

  async function fetchPages(query: Record<string, unknown>): Promise<PagesResponse | undefined> {
    try {
      return await globalThis.$fetch('/__ai-ready/pages', { query }) as PagesResponse
    }
    catch {
      // no server route on a fully prerendered deploy; the caller falls back
      return undefined
    }
  }

  /**
   * The index written during prerendering. Used when there is no server route,
   * and when the runtime database has not been populated yet.
   */
  let index: Promise<PageSummary[]> | undefined
  function fetchIndex(): Promise<PageSummary[]> {
    index ??= (async () => {
      try {
        const data = await globalThis.$fetch('/__ai-ready/pages.json') as { pages?: PageSummary[] }
        return data.pages || []
      }
      catch {
        // neither source is available, so the tools report an empty site
        return []
      }
    })()
    return index
  }

  return [
    {
      name: 'list_pages',
      title: 'List pages',
      description: 'Lists pages on this site with their route, title and description. Use it to see what the site covers before reading a page.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many pages to return. Defaults to 20.' },
          offset: { type: 'number', description: 'How many pages to skip, for paging through long sites.' },
        },
      },
      annotations: READ_ONLY,
      async execute({ limit, offset }) {
        const size = clamp(limit, 20, 50)
        const start = Math.max(0, Math.trunc(Number(offset)) || 0)

        const data = await fetchPages({ limit: size, offset: start })
        let pages = data?.pages || []
        let total = data?.total ?? 0

        if (!pages.length) {
          const all = await fetchIndex()
          pages = all.slice(start, start + size)
          total = all.length
        }

        if (!pages.length)
          return toolText(start ? `No pages past offset ${start}.` : 'This site has no indexed pages yet.')

        return formatPages(pages, `Pages ${start + 1} to ${start + pages.length} of ${total || pages.length}.`)
      },
    },
    {
      name: 'search_pages',
      title: 'Search pages',
      description: 'Searches the full content of this site and returns the best matching pages with their route, title and description. Takes a plain language query.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words or a phrase to search for, such as "refund policy".' },
          limit: { type: 'number', description: `How many results to return. Defaults to ${searchLimit}.` },
        },
        required: ['query'],
      },
      annotations: READ_ONLY,
      async execute({ query, limit }) {
        const q = String(query ?? '').trim()
        if (!q)
          return toolError('A search query is required. Pass the words to search for as `query`.')

        const size = clamp(limit, searchLimit, 50)
        const data = await fetchPages({ q, limit: size })
        let results = data?.results || []

        if (!results.length)
          results = searchIndex(await fetchIndex(), q, size)

        if (!results.length)
          return toolText(`Nothing matched "${q}". Try fewer or broader words, or call list_pages to see what the site covers.`)

        return formatPages(results, `${results.length} result${results.length === 1 ? '' : 's'} for "${q}".`)
      },
    },
    {
      name: 'get_page_markdown',
      title: 'Read page',
      description: 'Reads a page of this site as markdown. Pass a route returned by list_pages or search_pages, such as /about.',
      inputSchema: {
        type: 'object',
        properties: {
          route: { type: 'string', description: 'Site route to read, such as /blog/hello-world.' },
        },
        required: ['route'],
      },
      annotations: READ_ONLY,
      async execute({ route }) {
        const path = normalizeRoute(route)
        if (!path)
          return toolError('A site route is required, such as /about. Call list_pages to see the available routes.')

        let markdown: string | undefined
        try {
          markdown = await globalThis.$fetch(toMarkdownPath(path), { responseType: 'text' }) as string
        }
        catch {
          // a missing or failing route becomes the correctable message below
        }
        if (!markdown)
          return toolError(`No page found at ${path}. Call search_pages or list_pages to find the correct route.`)

        return toolText(truncateToolOutput(
          markdown,
          maxOutputChars,
          `Read ${toMarkdownPath(path)} directly for the full page.`,
        ))
      },
    },
  ]
}
