// Database access - Drizzle
export { closeDrizzle, useDrizzle, useRawDb } from './server/db'
export type { DatabaseDialect, DrizzleDatabase, RawExecutor } from './server/db'

// Queries from the full queries module (uses raw SQL internally)
export {
  countPages,
  getPageLastmods,
  getStaleRoutes,
  isPageFresh,
  pruneStaleRoutes,
  queryPages,
  searchPages,
  seedRoutes,
  streamPages,
  upsertPage,
} from './server/db/queries'
export type {
  CountPagesOptions,
  PageData,
  PageEntry,
  PageRow,
  QueryPagesOptions,
  SearchPagesOptions,
  SearchResult,
  StreamPagesOptions,
  UpsertPageInput,
} from './server/db/queries'

// Server utils - only available in Nitro context
export { indexPage, indexPageByRoute } from './server/utils/indexPage'
export type { IndexPageOptions, IndexPageResult } from './server/utils/indexPage'

// Re-export types
export type {
  MarkdownContext,
  PageIndexedContext,
} from './types'
