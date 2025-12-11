import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  nitro: {
    preset: 'cloudflare-durable',
    prerender: {
      crawlLinks: true,
      routes: ['/', '/about'],
      failOnError: false,
    },
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
})
