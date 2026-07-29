import type { SitemapSourcesHookCtx } from '@nuxtjs/sitemap'
import type { NitroApp } from 'nitropack/types'
import fallbackSources from '#ai-ready-virtual/sitemap-sources.mjs'
import { mergeSitemapFallbackSources } from '../../sitemap-source-fallback'

export default function sitemapSourceFallbackPlugin(nitroApp: NitroApp) {
  nitroApp.hooks.hook('sitemap:sources', (context: SitemapSourcesHookCtx) => {
    context.sources = mergeSitemapFallbackSources(context.sources, fallbackSources)
  })
}
