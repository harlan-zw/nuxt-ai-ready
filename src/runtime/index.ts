// Server utils - only available in Nitro context
export { indexPage, indexPageByRoute } from './server/utils/indexPage'
export type { IndexPageOptions, IndexPageResult } from './server/utils/indexPage'

// Page data composables
export { getPages, getPagesList, getErrorRoutes } from './server/utils/pageData'
export type { PageEntry, PageData, PageListItem } from './server/utils/pageData'

// Re-export types
export type {
  MarkdownContext,
  PageIndexedContext,
  PageMarkdownContext,
} from './types'
