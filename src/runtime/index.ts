// Database access
export { useDatabase } from './server/db'
export { countPages, getStaleRoutes, pruneStaleRoutes, queryPages, searchPages, upsertPage } from './server/db/queries'

export type { CountPagesOptions, PageData, PageEntry, PageRow, QueryPagesOptions, SearchResult } from './server/db/queries'
export type { DatabaseAdapter } from './server/db/schema'

// Server utils - only available in Nitro context
export { indexPage, indexPageByRoute } from './server/utils/indexPage'
export type { IndexPageOptions, IndexPageResult } from './server/utils/indexPage'
// Page data composables
export { getErrorRoutes, getPages, getPagesList } from './server/utils/pageData'
export type { PageListItem } from './server/utils/pageData'

// Re-export types
export type {
  MarkdownContext,
  PageIndexedContext,
  PageMarkdownContext,
} from './types'
