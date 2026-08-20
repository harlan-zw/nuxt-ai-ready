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
    // The repository .nuxtrc enables WebMCP. Disable it to prove zero storage.
    webmcp: false,
  },
})
