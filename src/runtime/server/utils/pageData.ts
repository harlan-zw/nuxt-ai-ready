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
    return readPrerenderedPageData()
  }

  const m = await import('#ai-ready-virtual/page-data.mjs')
  return m.pages?.length ? new Map(m.pages.map((p: PageEntry) => [p.route, p])) : new Map()
}

/** Get all page data including markdown (prerender only) */
export async function readPrerenderedPageData(): Promise<Map<string, PageData>> {
  if (!import.meta.prerender)
    return new Map()

  const { readPageDataFromFilesystem } = await import('#ai-ready-virtual/read-page-data.mjs')
  const pages = await readPageDataFromFilesystem()
  return pages?.length ? new Map(pages.map((p: PageData) => [p.route, p])) : new Map()
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
