export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  routeRules: {
    '/**': { isr: 3600 },
  },

  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for Nuxt AI Search',
  },

  aiReady: {},
})
