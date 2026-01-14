import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  nitro: {
    preset: 'cloudflare-module',
    prerender: {
      crawlLinks: true,
      routes: ['/', '/about'],
      failOnError: false,
    },
    rollupConfig: {
      external: ['@cloudflare/puppeteer', 'agents', 'agents/mcp', /^cloudflare:/, '__STATIC_CONTENT_MANIFEST'],
    },
  },
  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for Nuxt AI Ready',
  },
  aiReady: {
    database: {
      type: 'd1',
      bindingName: 'DB',
    },
  },
})
