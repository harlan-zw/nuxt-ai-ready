import { createResolver } from '@nuxt/kit'
import Module from '../../../src/module'

const resolve = createResolver(import.meta.url)

export default defineNuxtConfig({
  modules: [Module, 'nuxt-site-config', '@nuxtjs/sitemap'],
  // Disable mcp-toolkit (incompatible with h3 v2)
  mcp: false,
  alias: {
    'nuxt-ai-index': resolve.resolve('../../../src/module.ts'),
  },
  compatibilityDate: '2025-10-15',
  aiReady: {
    debug: true,
  },
  sitemap: {
    sources: [
      {
        urls: [
          '/',
          '/about',
          '/docs/getting-started',
          '/docs/configuration',
          '/docs/usage',
          '/docs/api',
          '/docs/faq',
        ],
      },
    ],
  },
})
