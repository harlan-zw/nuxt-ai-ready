import type { H3Event } from 'h3'
import { useDatabase } from '../db'
import { getAllPages as dbGetAllPages, getErrorRoutes as dbGetErrorRoutes } from '../db/queries'

/** Page entry from database */
export interface PageEntry {
  route: string
  title: string
  description: string
  headings: string
  keywords: string[]
  updatedAt: string
}

/** Page data includes markdown content */
export interface PageData extends PageEntry {
  markdown: string
}

/** Page list item for MCP tools/resources */
export interface PageListItem {
  route: string
  title: string
  description: string
  headings?: string
  keywords?: string[]
}

/** Try to get the current H3Event from context or use provided event */
function getEventFromContext(providedEvent?: H3Event): H3Event | undefined {
  if (providedEvent) return providedEvent
  // Dynamic import to avoid circular dependencies
  const { useEvent } = require('nitropack/runtime')
  return useEvent().catch(() => undefined)
}

/** Read page data - returns page data indexed by route */
export async function getPages(event?: H3Event): Promise<Map<string, PageEntry>> {
  if (import.meta.dev) return new Map()

  if (import.meta.prerender) {
    return (await readPrerenderedData()).pages
  }

  // Use database for runtime
  const db = await useDatabase(getEventFromContext(event))
  const pages = await dbGetAllPages(db)
  return new Map(pages.map(p => [p.route, p]))
}

/** Get error routes detected during prerender */
export async function getErrorRoutes(event?: H3Event): Promise<Set<string>> {
  if (import.meta.dev) return new Set()

  if (import.meta.prerender) {
    return (await readPrerenderedData()).errorRoutes
  }

  // Use database for runtime
  const db = await useDatabase(getEventFromContext(event))
  const routes = await dbGetErrorRoutes(db)
  return new Set(routes)
}

/** Get pages as flat list for MCP consumption */
export async function getPagesList(event?: H3Event): Promise<PageListItem[]> {
  const pages = await getPages(event)
  return Array.from(pages.values()).map(p => ({
    route: p.route,
    title: p.title || p.route,
    description: p.description || '',
    headings: p.headings || undefined,
    keywords: p.keywords?.length ? p.keywords : undefined,
  }))
}

/** Read page data from filesystem during prerender */
async function readPrerenderedData(): Promise<{ pages: Map<string, PageData>, errorRoutes: Set<string> }> {
  const m = await import('#ai-ready-virtual/read-page-data.mjs')
  const data = await (m as unknown as {
    readPageDataFromFilesystem: () => Promise<{ pages: PageData[], errorRoutes: string[] }>
  }).readPageDataFromFilesystem()

  return {
    pages: new Map(data.pages?.map(p => [p.route, p]) || []),
    errorRoutes: new Set(data.errorRoutes || []),
  }
}
