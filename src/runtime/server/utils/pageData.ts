import type { H3Event } from 'h3'
import type { PageData, PageEntry } from '../db/queries'
import { useDatabase } from '../db'
import { queryPages } from '../db/queries'

/** Page list item for MCP tools/resources */
export interface PageListItem {
  route: string
  title: string
  description: string
  headings?: string
  keywords?: string[]
}

/** Try to get the current H3Event from context or use provided event */
async function getEventFromContext(providedEvent?: H3Event): Promise<H3Event | undefined> {
  if (providedEvent)
    return providedEvent
  // Dynamic import to avoid circular dependencies
  const { useEvent } = await import('nitropack/runtime')
  // Wrap synchronous throw in promise for .catch() handling
  return Promise.resolve().then(() => useEvent()).catch(() => undefined)
}

let devWarningShown = false

/** Read page data - returns page data indexed by route */
export async function getPages(event?: H3Event): Promise<Map<string, PageEntry>> {
  if (import.meta.dev) {
    if (!devWarningShown) {
      console.warn('[nuxt-ai-ready] Page data unavailable in dev. Run `nuxi generate` for full metadata.')
      devWarningShown = true
    }
    return new Map()
  }

  if (import.meta.prerender) {
    return (await readPrerenderedData()).pages
  }

  // Use database for runtime
  const db = await useDatabase(await getEventFromContext(event))
  const pages = await queryPages(db) as PageEntry[]
  return new Map(pages.map(p => [p.route, p]))
}

/** Get error routes detected during prerender */
export async function getErrorRoutes(event?: H3Event): Promise<Set<string>> {
  if (import.meta.dev)
    return new Set()

  if (import.meta.prerender) {
    return (await readPrerenderedData()).errorRoutes
  }

  // Use database for runtime
  const db = await useDatabase(await getEventFromContext(event))
  const pages = await queryPages(db, { where: { hasError: true } }) as PageEntry[]
  return new Set(pages.map(p => p.route))
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
