import type { ParseSitemap } from './sitemap-parser'
import { parseSitemapStream } from '@nuxtjs/sitemap/utils'

export const parseSitemap: ParseSitemap = input => parseSitemapStream(input)
