import pages from './server/mcp/resources/pages'
import getPageMarkdown from './server/mcp/tools/get-page-markdown'
import listPages from './server/mcp/tools/list-pages'
import searchPages from './server/mcp/tools/search-pages'

export const tools = [listPages, searchPages, getPageMarkdown] as const
export const resources = [pages] as const
