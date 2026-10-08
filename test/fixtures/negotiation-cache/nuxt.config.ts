export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  routeRules: {
    '/cache/**': { cache: { maxAge: 3600, varies: ['accept'] } },
  },
  site: { url: 'https://test.example.com' },
})
