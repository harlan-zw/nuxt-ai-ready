import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../basic'],
  app: {
    baseURL: '/docs/',
  },
  aiReady: {
    llmsTxtCacheSeconds: 0,
  },
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: [],
    },
  },
  robots: {
    robotsTxt: false,
  },
  sitemap: {
    urls: ['/about', '/docs/api'],
  },
})
