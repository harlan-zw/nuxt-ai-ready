export default defineNuxtConfig({
  extends: ['../ai-terms'],
  aiReady: {
    apiCatalog: false,
    describedby: false,
  },
  nitro: {
    preset: 'cloudflare-module',
    compatibilityDate: '2026-10-08',
    cloudflare: { deployConfig: true, wrangler: { name: 'ai-terms-policy-test' } },
  },
})
