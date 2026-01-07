import pages from './server/mcp/resources/pages'
import listPages from './server/mcp/tools/list-pages'
import searchPagesFuzzy from './server/mcp/tools/search-pages-fuzzy'

export const tools = [listPages, searchPagesFuzzy] as const
export const resources = [pages] as const
