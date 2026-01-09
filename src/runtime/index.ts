// Server utils - only available in Nitro context
export { indexPage, indexPageByRoute } from './server/utils/indexPage'
export type { IndexPageOptions, IndexPageResult } from './server/utils/indexPage'

// Page data composables
export { getPages, getPagesList, getErrorRoutes } from './server/utils/pageData'
export type { PageEntry, PageData, PageListItem } from './server/utils/pageData'

// Database access
export { useDatabase } from './server/db'
export type { DatabaseAdapter } from './server/db/schema'
export { searchPages, getAllPages, getPage, getPageWithMarkdown, upsertPage, getPageCount } from './server/db/queries'
export type { SearchResult, PageRow } from './server/db/queries'

// Re-export types
export type {
  MarkdownContext,
  PageIndexedContext,
  PageMarkdownContext,
} from './types'
