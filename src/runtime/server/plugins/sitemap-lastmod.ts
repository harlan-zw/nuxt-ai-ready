import { readFile } from 'node:fs/promises'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'

interface ContentHashManifest {
  pages: Record<string, {
    contentHash: string
    updatedAt: string
    firstSeenAt: string
  }>
  version: string
}

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const manifestPath = (config['nuxt-ai-ready'] as any)?.timestampsManifestPath

  if (!manifestPath) {
    return
  }

  nitroApp.hooks.hook('sitemap:resolved', async (ctx: { urls: Array<{ loc: string, lastmod?: string | Date }> }) => {
    const manifest = await readFile(manifestPath, 'utf-8')
      .then(data => JSON.parse(data) as ContentHashManifest)
      .catch(() => null)

    if (!manifest) {
      return
    }

    for (const url of ctx.urls) {
      // Normalize route (strip domain, remove trailing slash)
      const route = url.loc.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/'

      const pageData = manifest.pages[route]
      if (pageData?.updatedAt) {
        url.lastmod = pageData.updatedAt
      }
    }
  })
})
