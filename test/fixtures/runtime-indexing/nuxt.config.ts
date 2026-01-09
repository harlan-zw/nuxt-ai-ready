export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  site: {
    url: 'https://test.example.com',
    name: 'Runtime Indexing Test',
    description: 'Test site for runtime indexing',
  },

  aiReady: {
    ttl: 0, // No TTL for testing
  },
})
