export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  site: {
    url: 'https://test.example.com',
    name: 'Runtime Indexing Test',
    description: 'Test site for runtime indexing',
  },

  aiReady: {
    cron: true,
    runtimeSync: {
      ttl: 0, // No TTL for testing
      batchSize: 5,
    },
  },
})
