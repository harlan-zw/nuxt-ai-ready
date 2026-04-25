export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  modules: ['@nuxt/content'],

  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test fixture for @nuxt/content integration',
  },

  aiReady: {},
})
