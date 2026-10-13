import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../basic'],
  app: {
    baseURL: '/docs/',
  },
  aiReady: {
    llmsTxt: { markdownLinks: false },
  },
  nitro: {
    static: true,
    prerender: {
      crawlLinks: false,
      routes: ['/', '/about', '/missing'],
      failOnError: false,
    },
  },
  robots: {
    robotsTxt: false,
  },
  sitemap: {
    urls: ['/about', '/docs/api', '/missing'],
  },
})
