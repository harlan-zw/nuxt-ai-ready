import type { PageEntry } from '../../db/queries'
import { getSiteConfig } from '#site-config/server/composables'
import { eventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { countPages, queryPages } from '../../db/queries'

export default eventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)['nuxt-ai-ready'] as any

  // Site URL for production toggle
  const siteConfigUrl = getSiteConfig(event).url
  // Build-time metadata not available in runtime config
  let devtoolsMeta = { contentSignal: false as any, mcp: { enabled: false, tools: false, resources: false }, cron: false }
  try {
    // @ts-expect-error untyped
    const m = await import('#ai-ready-virtual/devtools-meta.mjs')
    devtoolsMeta = m.devtoolsMeta
  }
  catch {}

  const response: Record<string, unknown> = {
    version: runtimeConfig.version,
    siteConfigUrl,
    isDev: import.meta.dev,
    config: {
      database: { type: runtimeConfig.database?.type || 'sqlite' },
      runtimeSync: runtimeConfig.runtimeSync,
      indexNow: !!runtimeConfig.indexNow,
      sitemapPrerendered: runtimeConfig.sitemapPrerendered,
      markdownCacheHeaders: runtimeConfig.markdownCacheHeaders,
      llmsTxtCacheSeconds: runtimeConfig.llmsTxtCacheSeconds,
      contentSignal: devtoolsMeta.contentSignal,
      mcp: devtoolsMeta.mcp,
      cron: devtoolsMeta.cron,
    },
    llmsTxt: runtimeConfig.llmsTxt,
  }

  // In production, include page stats and list
  if (!import.meta.dev) {
    try {
      const [total, pending, errors] = await Promise.all([
        countPages(event),
        countPages(event, { where: { pending: true } }),
        countPages(event, { where: { hasError: true } }),
      ])
      response.stats = { total, indexed: total - pending, pending, errors }

      const pages = await queryPages(event) as PageEntry[]
      response.pages = pages.map(p => ({
        route: p.route,
        title: p.title,
        description: p.description,
        updatedAt: p.updatedAt,
      }))
    }
    catch {}
  }

  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  // Allow cross-origin for devtools production toggle
  setHeader(event, 'Access-Control-Allow-Origin', '*')
  return response
})
