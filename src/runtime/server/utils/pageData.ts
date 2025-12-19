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

/** Read page data - returns page data indexed by route */
export async function getPages(): Promise<Map<string, PageEntry>> {
  if (import.meta.dev)
    return new Map()

  if (import.meta.prerender) {
    const data = await readPrerenderedData()
    return data.pages
  }

  const m = await import('#ai-ready-virtual/page-data.mjs') as { pages?: PageEntry[] }
  return m.pages?.length ? new Map(m.pages.map((p: PageEntry) => [p.route, p])) : new Map()
}

/** Get all page data including markdown (prerender only) */
async function readPrerenderedData(): Promise<{ pages: Map<string, PageData>, errorRoutes: Set<string> }> {
  if (!import.meta.prerender)
    return { pages: new Map(), errorRoutes: new Set() }

  const m = await import('#ai-ready-virtual/read-page-data.mjs') as unknown as {
    readPageDataFromFilesystem: () => Promise<{ pages: PageData[], errorRoutes: string[] }>
  }
  const data = await m.readPageDataFromFilesystem()
  return {
    pages: data.pages?.length ? new Map(data.pages.map((p: PageData) => [p.route, p])) : new Map(),
    errorRoutes: new Set(data.errorRoutes || []),
  }
}

/** Page list item for MCP tools/resources */
export interface PageListItem {
  route: string
  title: string
  description: string
  headings?: string
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

/** Get error routes detected during prerender */
export async function getErrorRoutes(): Promise<Set<string>> {
  if (import.meta.dev)
    return new Set()

  if (import.meta.prerender) {
    const data = await readPrerenderedData()
    return data.errorRoutes
  }

  const m = await import('#ai-ready-virtual/page-data.mjs') as { errorRoutes?: string[] }
  return new Set(m.errorRoutes || [])
}
