import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../basic'],
  aiReady: {
    llmsTxt: {
      markdownLinks: true,
    },
  },
  robots: {
    robotsTxt: false,
  },
  sitemap: {
    urls: ['/api/status', '/_internal', '/guide.pdf'],
  },
})
