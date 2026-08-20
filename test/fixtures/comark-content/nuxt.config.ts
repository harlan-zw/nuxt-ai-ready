export default defineNuxtConfig({
  modules: ['@harlan-zw/comark-content'],

  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test fixture for @harlan-zw/comark-content integration',
  },

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/'],
      failOnError: false,
    },
  },

  aiReady: {
    // Flipped by the equivalence test so one fixture can be indexed both ways:
    // once from the collection, once by converting the rendered HTML.
    contentSource: process.env.AI_READY_CONTENT_SOURCE !== 'off',
  },
})
