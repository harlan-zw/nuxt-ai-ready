export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  experimental: {
    inlineRouteRules: true,
  },

  routeRules: {
    '/': {
      headers: {
        'cloudflare-cdn-cache-control': 'public, max-age=3600',
        'vary': 'Accept-Encoding',
      },
    },
    '/about': {
      cache: {
        maxAge: 3600,
        varies: ['accept', 'sec-fetch-dest', 'user-agent'],
      },
    },
    '/docs/**': { cache: { maxAge: 3600 } },
  },

  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for Nuxt AI Search',
  },

  aiReady: {},
})
