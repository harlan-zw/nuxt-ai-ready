import { useStorage } from 'nitropack/runtime'

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

/** Read page data - returns page data indexed by route */
export async function getPages(): Promise<Map<string, PageEntry>> {
  if (import.meta.dev)
    return new Map()

  if (import.meta.prerender)
    return (await readPrerenderedData()).pages

  return (await readServerAssets()).pages
}

/** Get error routes detected during prerender */
export async function getErrorRoutes(): Promise<Set<string>> {
  if (import.meta.dev)
    return new Set()

  if (import.meta.prerender)
    return (await readPrerenderedData()).errorRoutes

  return (await readServerAssets()).errorRoutes
}

/** Get pages as flat list for MCP consumption */
export async function getPagesList(): Promise<PageListItem[]> {
  const pages = await getPages()
  return Array.from(pages.values()).map(p => ({
    route: p.route,
    title: p.title || p.route,
    description: p.description || '',
    headings: p.headings || undefined,
  }))
}

/** Read page data from server assets storage */
async function readServerAssets(): Promise<{ pages: Map<string, PageEntry>, errorRoutes: Set<string> }> {
  const storage = useStorage('assets:ai-ready-data')
  const data = await storage.getItem('pages.json') as { pages?: PageEntry[], errorRoutes?: string[] } | null

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
