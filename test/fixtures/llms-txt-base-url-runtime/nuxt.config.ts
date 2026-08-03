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
  hooks: {
    'nitro:config'(nitro) {
      // Nuxt merges layer route arrays, so clear the basic fixture's `/`.
      nitro.prerender!.routes = []
    },
  },
  robots: {
    robotsTxt: false,
  },
  sitemap: {
    urls: ['/about', '/docs/api'],
  },
})
