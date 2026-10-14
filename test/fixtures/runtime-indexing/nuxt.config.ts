const postgresUrl = process.env.NUXT_AI_READY_TEST_POSTGRES_URL

export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  runtimeConfig: {
    appSecret: 'runtime-indexing-application-secret-32-characters',
  },

  site: {
    url: 'https://test.example.com',
    name: 'Runtime Indexing Test',
    description: 'Test site for runtime indexing',
  },

  sitemap: {
    cacheMaxAgeSeconds: 0,
    sources: ['/api/__cms-sitemap'],
  },

  aiReady: {
    ...(postgresUrl
      ? { database: { type: 'postgres' as const, url: postgresUrl } }
      : {}),
    cron: true,
    runtimeSync: {
      ttl: 0, // No TTL for testing
      batchSize: 5,
    },
  },
})
