export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/'],
      failOnError: false,
    },
  },

  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for Nuxt AI Search',
  },

  aiReady: {
    // No database driver. Build time generation must still work.
    database: false,
  },
})
