import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  nitro: {
    preset: 'netlify',
    routeRules: {
      '/*.md': { headers: { 'X-Robots-Tag': 'noindex' } },
      '/llms.txt': { headers: { 'X-Robots-Tag': 'noindex' } },
    },
    prerender: {
      crawlLinks: true,
      routes: ['/', '/about', '/docs/getting-started', '/docs/api'],
      failOnError: false,
    },
  },
  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for Nuxt AI Ready',
  },
  aiReady: {
    llmsTxt: {
      markdownLinks: true,
    },
  },
})
