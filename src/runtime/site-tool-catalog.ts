export const SITE_TOOL_NAMES = [
  'list_pages',
  'search_pages',
  'get_page_markdown',
] as const

export type SiteToolName = typeof SITE_TOOL_NAMES[number]

export const SITE_TOOL_CATALOG = {
  list_pages: {
    name: 'list_pages',
    title: 'List pages',
    description: 'Lists pages on this site with their route, title and description. Use it to see what the site covers before reading a page.',
    parameters: {
      limit: 'How many pages to return. Defaults to 20.',
      offset: 'How many pages to skip, for paging through long sites.',
    },
  },
  search_pages: {
    name: 'search_pages',
    title: 'Search pages',
    description: 'Searches the full content of this site and returns the best matching pages with their route, title and description. Takes a plain language query.',
    parameters: {
      query: 'Words or a phrase to search for, such as "refund policy".',
      limit: 'How many results to return. Defaults to 10.',
    },
  },
  get_page_markdown: {
    name: 'get_page_markdown',
    title: 'Read page',
    description: 'Reads a page of this site as markdown. Pass a route returned by list_pages or search_pages, such as /about.',
    parameters: {
      route: 'Site route to read, such as /blog/hello-world.',
    },
  },
} as const satisfies Record<SiteToolName, {
  name: SiteToolName
  title: string
  description: string
  parameters: Record<string, string>
}>

const RE_LEADING_SLASHES = /^\/+/
const RE_MARKDOWN_SUFFIX = /\.md$/
const RE_QUERY_OR_FRAGMENT = /[?#].*$/

export function normalizeSiteRoute(input: unknown): string | undefined {
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
