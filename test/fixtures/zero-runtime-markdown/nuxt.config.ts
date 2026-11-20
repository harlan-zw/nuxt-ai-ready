import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  experimental: { inlineRouteRules: true },
  aiReady: { zeroRuntimeMarkdown: true },
  app: { baseURL: '/docs/' },
  site: { url: 'https://test.example.com' },
  sitemap: { urls: ['/docs/docs/api'] },
  routeRules: { '/without-markdown.md': { prerender: false } },
  nitro: { prerender: { crawlLinks: false } },
})
