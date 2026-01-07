import pages from './resources/pages'
import listPages from './tools/list-pages'
import searchPagesFuzzy from './tools/search-pages-fuzzy'

export const tools = [listPages, searchPagesFuzzy] as const
export const resources = [pages] as const
