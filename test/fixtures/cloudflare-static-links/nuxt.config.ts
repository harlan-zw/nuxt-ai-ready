export default defineNuxtConfig({
  extends: ['../cloudflare'],
  aiReady: {
    database: false,
    apiCatalog: { entries: [{ anchor: '/api', serviceDoc: { href: '/docs/api', type: 'text/html' } }] },
  },
})
