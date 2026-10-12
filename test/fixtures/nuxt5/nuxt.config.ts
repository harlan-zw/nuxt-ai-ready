import type { Nuxt } from 'nuxt/schema'
import { getNitroVersion } from '@nuxt/kit'
import NuxtAiReady from 'nuxt-ai-ready'
import NuxtRobots from '@nuxtjs/robots'
import NuxtSitemap from '@nuxtjs/sitemap'
import NuxtSiteConfig from 'nuxt-site-config'
import NuxtSeoShared from 'nuxtseo-shared'

// Allow the pinned nightly only in this consumer fixture.
{
  const modules: Array<{ getMeta?: () => Promise<{ compatibility?: { nuxt?: string } }> }> = [NuxtAiReady, NuxtRobots, NuxtSitemap, NuxtSiteConfig, NuxtSeoShared]
  for (const module of modules) {
    const meta = await module.getMeta?.()
    if (!meta)
      throw new Error('The module must expose compatibility metadata.')
    meta.compatibility ||= {}
    meta.compatibility.nuxt = '^4.6.0 || ^5.0.0 || 5.0.0-2610061032-c7ad8cd'
  }
}

function verifyBuilder(_options: unknown, nuxt: Nuxt) {
  nuxt.hook('modules:done', () => {
    const expected = 3
    const actual = getNitroVersion(nuxt)
    if (actual !== expected)
      throw new Error(`Expected Nitro ${expected}, resolved ${actual}`)
  })
}

export default defineNuxtConfig({
  workspaceDir: import.meta.dirname,
  future: { compatibilityVersion: 5 },
  modules: [NuxtSiteConfig, verifyBuilder,NuxtRobots, NuxtSitemap, NuxtAiReady],
  mcp: false,
  aiReady: {
    agentSkills: false,
    database: {
      type: 'sqlite',
    },
  },
  site: {
    url: 'https://nuxt5.example.com',
  },
  runtimeConfig: {
    aiReadyCompatMarker: 'nuxt-5',
  },
  routeRules: {
    '/cache/**': { cache: { maxAge: 3600, varies: ['accept'] } },
  },
  vite: {
    resolve: {
      dedupe: ['nuxt', 'vue', 'vue-router'],
    },
  },
  compatibilityDate: '2026-06-10',
})
