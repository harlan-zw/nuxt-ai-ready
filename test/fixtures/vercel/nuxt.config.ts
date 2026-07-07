import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  // Must be >= 2025-07-15: nitro's vercel preset only emits per-handler
  // function routes (the #825 trigger) past that compat date, and the
  // layer's compatibilityDate does not propagate to the app config.
  compatibilityDate: '2025-10-15',
  nitro: {
    preset: 'vercel',
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
})
