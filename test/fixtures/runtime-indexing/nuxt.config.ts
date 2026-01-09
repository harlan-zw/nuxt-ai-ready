export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  site: {
    url: 'https://test.example.com',
    name: 'Runtime Indexing Test',
    description: 'Test site for runtime indexing',
  },

  aiReady: {
    runtimeIndexing: {
      enabled: true,
      storage: 'ai-ready',
      ttl: 0, // No TTL for testing
    },
  },

  // Use memory storage for tests
  nitro: {
    storage: {
      'ai-ready': { driver: 'memory' },
    },
  },
})
