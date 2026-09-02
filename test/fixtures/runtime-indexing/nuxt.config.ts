const postgresUrl = process.env.NUXT_AI_READY_TEST_POSTGRES_URL

export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  site: {
    url: 'https://test.example.com',
    name: 'Runtime Indexing Test',
    description: 'Test site for runtime indexing',
  },

  aiReady: {
    ...(postgresUrl
      ? { database: { type: 'postgres' as const, url: postgresUrl } }
      : {}),
    cron: true,
    runtimeSyncSecret: 'test-secret-123',
    runtimeSync: {
      ttl: 0, // No TTL for testing
      batchSize: 5,
    },
  },
})
