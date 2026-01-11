export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  site: {
    url: 'https://test.example.com',
    name: 'Runtime Indexing Test',
    description: 'Test site for runtime indexing',
  },

  aiReady: {
    runtimeSync: {
      enabled: true,
      ttl: 0, // No TTL for testing
      batchSize: 5,
      cron: '0 0 * * *', // Daily at midnight (won't actually run in tests)
    },
  },
})
