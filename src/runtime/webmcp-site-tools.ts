import type { WebMcpTool, WebMcpToolResult } from './webmcp'
import { toMarkdownPath } from './markdown-path'
import { toDeployedRoute } from './route-path'
import { toolError, toolText, truncateToolOutput, WEB_MCP_BUDGET } from './webmcp'

export interface SiteToolsOptions {
  /** Nuxt application base URL. */
  baseURL?: string
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
  page?: PageSummary | null
  pages?: PageSummary[]
  results?: PageSummary[]
  total?: number
}

type FetchResult<T> = { _tag: 'Ok', value: T } | { _tag: 'NotFound' } | { _tag: 'Error', error: unknown }
type LookupResult<T> = { _tag: 'Ok', value: T } | { _tag: 'Error', error: unknown }

interface FetchOptions {
  query?: Record<string, unknown>
  responseType?: 'text'
}

/** Page content is whatever the site indexed, so treat it as untrusted input. */
const READ_ONLY = { readOnlyHint: true, untrustedContentHint: true }

const RE_FTS_CHARS = /[*:^"()]/g
const RE_LEADING_SLASHES = /^\/+/
const RE_MARKDOWN_SUFFIX = /\.md$/
const RE_QUERY_OR_FRAGMENT = /[?#].*$/
const RE_WHITESPACE = /\s+/

/** Field weights matching the server-side FTS query, excluding unavailable markdown. */
const SEARCH_WEIGHTS: Array<[keyof PageSummary, number]> = [
  ['route', 5],
  ['title', 3],
  ['headings', 2],
  ['keywords', 2],
  ['description', 1],
]

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}

function parsePageSummary(input: unknown): PageSummary | undefined {
  if (!isRecord(input) || typeof input.route !== 'string' || !input.route)
    return undefined

  return {
    route: input.route,
    ...(typeof input.title === 'string' ? { title: input.title } : {}),
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    ...(typeof input.headings === 'string' ? { headings: input.headings } : {}),
    ...(Array.isArray(input.keywords)
      ? { keywords: input.keywords.filter((keyword): keyword is string => typeof keyword === 'string') }
      : {}),
  }
}

function parsePageList(input: unknown): PageSummary[] {
  if (!Array.isArray(input))
    return []
  return input.map(parsePageSummary).filter((page): page is PageSummary => !!page)
}

function parsePagesResponse(input: unknown): PagesResponse {
  if (!isRecord(input))
    return {}

  const page = input.page === null ? null : parsePageSummary(input.page)
  return {
    ...(page !== undefined ? { page } : {}),
    pages: parsePageList(input.pages),
    results: parsePageList(input.results),
    ...(typeof input.total === 'number' && Number.isFinite(input.total) ? { total: input.total } : {}),
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error))
    return undefined
  const response = error.response
  if (isRecord(response) && typeof response.status === 'number')
    return response.status
  return typeof error.statusCode === 'number' ? error.statusCode : undefined
}

function fetchResource(path: string, options?: FetchOptions): Promise<FetchResult<unknown>> {
  return Promise.resolve()
    .then(() => options ? globalThis.$fetch(path, options) : globalThis.$fetch(path))
    .then(
      value => ({ _tag: 'Ok', value }) as const,
      error => getErrorStatus(error) === 404
        ? { _tag: 'NotFound' } as const
        : { _tag: 'Error', error } as const,
    )
}

function reportFetchError(source: string, result: FetchResult<unknown>): void {
  if (result._tag === 'Error')
    console.error(`[nuxt-ai-ready] Failed to read WebMCP ${source}.`, result.error)
}

/**
 * Rank the prerendered index in the browser. Only reached on fully static
 * deployments, where there is no server left to run the FTS query.
 */
function searchIndex(pages: PageSummary[], query: string, limit: number): PageSummary[] {
  const terms = query
    .replace(RE_FTS_CHARS, ' ')
    .toLowerCase()
    .split(RE_WHITESPACE)
    .filter(Boolean)
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
  const value = String(input ?? '').trim().replace(RE_QUERY_OR_FRAGMENT, '')
  if (!value || value.includes('://') || value.includes('\\'))
    return undefined

  const route = `/${value.replace(RE_LEADING_SLASHES, '').replace(RE_MARKDOWN_SUFFIX, '')}`
  const decodedRoute = (() => {
    try {
      return decodeURIComponent(route)
    }
    catch {
      return ''
    }
  })()
  if (!decodedRoute || decodedRoute.split('/').some(segment => segment === '.' || segment === '..'))
    return undefined
  return route
}

function clamp(input: unknown, fallback: number, max: number): number {
  const value = Math.trunc(Number(input))
  if (!Number.isFinite(value) || value < 1)
    return fallback
  return Math.min(value, max)
}

function cleanSummaryPart(input: string): string {
  return input.replace(RE_WHITESPACE, ' ').trim()
}

/**
 * Read-only tools mirroring the MCP server, so an agent running inside the
 * browser can discover and read site content without leaving the page.
 */
export function createSiteTools(options: SiteToolsOptions = {}): WebMcpTool[] {
  const baseURL = options.baseURL || '/'
  const maxOutputChars = options.maxOutputChars ?? WEB_MCP_BUDGET.output
  const searchLimit = clamp(options.searchLimit, 10, 50)
  const pagesPath = toDeployedRoute('/__ai-ready/pages', baseURL)
  const indexPath = toDeployedRoute('/__ai-ready/pages.json', baseURL)

  /**
   * One page per line rather than JSON, so trimming to the output budget drops
   * whole entries instead of leaving the agent with a half-parsed blob.
   */
  function formatPages(
    pages: PageSummary[],
    summaryForCount: (count: number) => string,
    recovery: string,
  ): WebMcpToolResult {
    const pageLines = pages.map(page => `\n${
      [page.route, page.title, page.description]
        .filter((part): part is string => !!part)
        .map(cleanSummaryPart)
        .join(' | ')
    }`)
    let lines: string[] = []

    const render = (visibleLines: string[]) => {
      const omitted = pageLines.length - visibleLines.length
      const note = omitted ? ` ${omitted} left out to fit; ${recovery}.` : ''
      return `${summaryForCount(visibleLines.length)}${note}${visibleLines.join('')}`
    }

    for (const line of pageLines) {
      const candidate = [...lines, line]
      if (maxOutputChars > 0 && render(candidate).length > maxOutputChars)
        break
      lines = candidate
    }

    return toolText(truncateToolOutput(render(lines), maxOutputChars))
  }

  function fetchPages(query: Record<string, unknown>): Promise<FetchResult<PagesResponse>> {
    return fetchResource(pagesPath, { query }).then(result =>
      result._tag === 'Ok'
        ? { _tag: 'Ok', value: parsePagesResponse(result.value) }
        : result,
    )
  }

  /**
   * The index written during prerendering. Used when there is no server route,
   * and when the runtime database has not been populated yet.
   */
  let index: Promise<FetchResult<PageSummary[]>> | undefined
  function fetchIndex(): Promise<FetchResult<PageSummary[]>> {
    index ??= fetchResource(indexPath).then((result) => {
      if (result._tag === 'Error')
        index = undefined
      if (result._tag !== 'Ok')
        return result
      const data = isRecord(result.value) ? result.value.pages : undefined
      return { _tag: 'Ok', value: parsePageList(data) }
    })
    return index
  }

  async function indexedRouteExists(route: string): Promise<LookupResult<boolean>> {
    const runtime = await fetchPages({ route })
    reportFetchError('page index', runtime)
    if (runtime._tag === 'Ok' && runtime.value.page)
      return { _tag: 'Ok', value: true }

    const prerendered = await fetchIndex()
    reportFetchError('prerendered page index', prerendered)
    if (prerendered._tag === 'Ok')
      return { _tag: 'Ok', value: prerendered.value.some(page => page.route === route) }
    if (runtime._tag === 'Ok')
      return { _tag: 'Ok', value: false }
    if (runtime._tag === 'Error')
      return runtime
    if (prerendered._tag === 'Error')
      return prerendered
    return { _tag: 'Ok', value: false }
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

        const runtime = await fetchPages({ limit: size, offset: start })
        reportFetchError('page index', runtime)
        let pages = runtime._tag === 'Ok' ? runtime.value.pages || [] : []
        let total = runtime._tag === 'Ok' ? runtime.value.total ?? 0 : 0

        if (!pages.length) {
          const prerendered = await fetchIndex()
          reportFetchError('prerendered page index', prerendered)
          if (prerendered._tag === 'Ok') {
            pages = prerendered.value.slice(start, start + size)
            total = prerendered.value.length
          }
          else if (runtime._tag === 'Error' || prerendered._tag === 'Error') {
            return toolError('The page index is temporarily unavailable. Retry list_pages shortly.')
          }
        }

        if (!pages.length)
          return toolText(start ? `No pages past offset ${start}.` : 'This site has no indexed pages yet.')

        return formatPages(
          pages,
          count => count
            ? `Pages ${start + 1} to ${start + count} of ${total || pages.length}.`
            : `Pages from offset ${start} of ${total || pages.length}.`,
          'use a higher offset',
        )
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
        const q = cleanSummaryPart(String(query ?? ''))
        if (!q)
          return toolError('A search query is required. Pass the words to search for as `query`.')

        const size = clamp(limit, searchLimit, 50)
        const runtime = await fetchPages({ q, limit: size })
        reportFetchError('page search', runtime)
        let results = runtime._tag === 'Ok' ? runtime.value.results || [] : []

        if (!results.length) {
          const prerendered = await fetchIndex()
          reportFetchError('prerendered page index', prerendered)
          if (prerendered._tag === 'Ok')
            results = searchIndex(prerendered.value, q, size)
          else if (runtime._tag === 'Error' || prerendered._tag === 'Error')
            return toolError('Page search is temporarily unavailable. Retry search_pages shortly.')
        }

        if (!results.length)
          return toolText(`Nothing matched "${q}". Try fewer or broader words, or call list_pages to see what the site covers.`)

        return formatPages(
          results,
          count => count
            ? `${count} result${count === 1 ? '' : 's'} for "${q}".`
            : `Results for "${q}".`,
          'narrow the query',
        )
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

        const indexed = await indexedRouteExists(path)
        if (indexed._tag === 'Error')
          return toolError('The page index is temporarily unavailable. Retry get_page_markdown shortly.')
        if (!indexed.value)
          return toolError(`No indexed page found at ${path}. Call search_pages or list_pages to find the correct route.`)

        const markdownPath = toDeployedRoute(toMarkdownPath(path), baseURL)
        const markdown = await fetchResource(markdownPath, { responseType: 'text' })
        reportFetchError('page markdown', markdown)
        if (markdown._tag === 'Error')
          return toolError(`Markdown for ${path} is temporarily unavailable. Retry get_page_markdown shortly.`)
        if (markdown._tag === 'NotFound' || typeof markdown.value !== 'string')
          return toolError(`No page found at ${path}. Call search_pages or list_pages to find the correct route.`)
        if (!markdown.value)
          return toolText(`The indexed page at ${path} has no markdown content.`)

        return toolText(truncateToolOutput(
          markdown.value,
          maxOutputChars,
          `Read ${markdownPath} directly for the full page.`,
        ))
      },
    },
  ]
}
