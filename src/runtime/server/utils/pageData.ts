import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { useEvent, useRuntimeConfig, useStorage } from 'nitropack/runtime'

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

/** Stored page entry with indexedAt timestamp */
interface StoredPageEntry extends PageEntry {
  markdown: string
  indexedAt: number
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

  // When runtime indexing is enabled, read from storage (includes prerendered + runtime-indexed)
  const storageData = await readFromStorage()
  if (storageData.pages.size > 0)
    return storageData.pages

  // Fall back to static prerendered data
  return (await readServerAssets(getEventFromContext(event))).pages
}

/** Get error routes detected during prerender */
export async function getErrorRoutes(event?: H3Event): Promise<Set<string>> {
  if (import.meta.dev)
    return new Set()

  if (import.meta.prerender)
    return (await readPrerenderedData()).errorRoutes

  // When runtime indexing is enabled, read from storage
  const storageData = await readFromStorage()
  if (storageData.errorRoutes.size > 0)
    return storageData.errorRoutes

  // Fall back to static prerendered data
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

/** Read page data from runtime storage (when runtime indexing is enabled) */
async function readFromStorage(): Promise<{ pages: Map<string, PageEntry>, errorRoutes: Set<string> }> {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig & {
    runtimeIndexing?: { enabled?: boolean, storage?: string }
  }

  if (!config.runtimeIndexing?.enabled)
    return { pages: new Map(), errorRoutes: new Set() }

  const storagePrefix = config.runtimeIndexing.storage || 'ai-ready'
  const storage = useStorage(storagePrefix)

  const [pageKeys, errorKeys] = await Promise.all([
    storage.getKeys('pages:'),
    storage.getKeys('errors:'),
  ])

  const pageEntries = await Promise.all(
    pageKeys.map(async (key) => {
      const data = await storage.getItem<StoredPageEntry>(key)
      if (!data)
        return null
      return {
        route: data.route,
        title: data.title,
        description: data.description,
        headings: data.headings,
        keywords: data.keywords || [],
        updatedAt: data.updatedAt,
      } as PageEntry
    }),
  )

  const errorEntries = await Promise.all(
    errorKeys.map(async (key) => {
      const data = await storage.getItem<{ route: string }>(key)
      return data?.route
    }),
  )

  return {
    pages: new Map(pageEntries.filter(Boolean).map(p => [p!.route, p!])),
    errorRoutes: new Set(errorEntries.filter(Boolean) as string[]),
  }
}
