export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/'],
    },
  },

  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for Nuxt AI Search',
  },
})
