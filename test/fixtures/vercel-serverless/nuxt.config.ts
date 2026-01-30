export default defineNuxtConfig({
  modules: [
    'nuxt-ai-ready',
  ],

  // Vercel serverless preset
  nitro: {
    preset: 'vercel',
  },

  aiReady: {
    // Database auto-detects: uses Neon if POSTGRES_URL present
    // Set explicitly to test specific providers:
    // database: { type: 'neon' },
    // database: { type: 'libsql', url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN },
  },

  // Required for sitemap
  site: {
    url: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  },

  devtools: { enabled: false },
  compatibilityDate: '2025-01-01',
})
