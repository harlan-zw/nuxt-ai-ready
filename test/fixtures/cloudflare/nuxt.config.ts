import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  nitro: {
    preset: 'cloudflare_pages',
    output: {
      publicDir: 'dist',
    },
    prerender: {
      crawlLinks: true,
      routes: ['/', '/about'],
      failOnError: false,
    },
    externals: {
      external: ['@cloudflare/puppeteer', 'agents', 'agents/mcp'],
    },
  },
  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for Nuxt AI Ready',
  },
})
