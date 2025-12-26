import type { H3Event } from 'h3'
import { useEvent } from 'nitropack/runtime'

/** Page entry from virtual module */
export interface PageEntry {
  route: string
  title: string
  description: string
  headings: string
  updatedAt: string
}

/** Page data from JSONL (includes markdown for llms-full.txt) */
export interface PageData extends PageEntry {
  markdown: string
}

/** Page list item for MCP tools/resources */
export interface PageListItem {
  route: string
  title: string
  description: string
  headings?: string
}

/** Try to get the current H3Event from context or use provided event */
function getEventFromContext(providedEvent?: H3Event): H3Event | undefined {
  if (providedEvent)
    return providedEvent
  try {
    // useEvent() requires experimental.asyncContext = true in Nitro config
    return useEvent()
  }
  catch {
    return undefined
  }
}

/** Read page data - returns page data indexed by route */
export async function getPages(event?: H3Event): Promise<Map<string, PageEntry>> {
  if (import.meta.dev)
    return new Map()

  if (import.meta.prerender)
    return (await readPrerenderedData()).pages

  return (await readServerAssets(getEventFromContext(event))).pages
}

/** Get error routes detected during prerender */
export async function getErrorRoutes(event?: H3Event): Promise<Set<string>> {
  if (import.meta.dev)
    return new Set()

  if (import.meta.prerender)
    return (await readPrerenderedData()).errorRoutes

  return (await readServerAssets(getEventFromContext(event))).errorRoutes
}

/** Get pages as flat list for MCP consumption */
export async function getPagesList(event?: H3Event): Promise<PageListItem[]> {
  const pages = await getPages(event)
  return Array.from(pages.values()).map(p => ({
    route: p.route,
    title: p.title || p.route,
    description: p.description || '',
    headings: p.headings || undefined,
  }))
}

/** Read page data from public directory via fetch */
async function readServerAssets(event?: H3Event): Promise<{ pages: Map<string, PageEntry>, errorRoutes: Set<string> }> {
  let data: { pages?: PageEntry[], errorRoutes?: string[] } | null = null

  // Try Cloudflare ASSETS binding first (for CF Pages/Workers)
  const cfEnv = event?.context?.cloudflare?.env as { ASSETS?: { fetch: (req: Request | string) => Promise<Response> } } | undefined
  if (cfEnv?.ASSETS?.fetch) {
    try {
      // Use a full URL for ASSETS.fetch as it expects a Request-like object
      const response = await cfEnv.ASSETS.fetch(new Request('https://assets.local/__ai-ready/pages.json'))
      if (response.ok) {
        data = await response.json()
      }
    }
    catch {
      // Fall through to regular fetch
    }
  }

  // Fall back to regular fetch for other platforms
  if (!data) {
    data = await globalThis.$fetch('/__ai-ready/pages.json', {
      baseURL: '/',
    }).catch(() => null) as { pages?: PageEntry[], errorRoutes?: string[] } | null
  }

  if (!data)
    return { pages: new Map(), errorRoutes: new Set() }

  return {
    pages: new Map(data.pages?.map(p => [p.route, p]) || []),
    errorRoutes: new Set(data.errorRoutes || []),
  }
}

/** Read page data from filesystem during prerender */
async function readPrerenderedData(): Promise<{ pages: Map<string, PageData>, errorRoutes: Set<string> }> {
  const m = await import('#ai-ready-virtual/read-page-data.mjs') as {
    readPageDataFromFilesystem: () => Promise<{ pages: PageData[], errorRoutes: string[] }>
  }
  const data = await m.readPageDataFromFilesystem()

  return {
    pages: new Map(data.pages?.map(p => [p.route, p]) || []),
    errorRoutes: new Set(data.errorRoutes || []),
  }
}
