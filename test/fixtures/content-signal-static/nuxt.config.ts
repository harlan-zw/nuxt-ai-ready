export default defineNuxtConfig({
  extends: ['../cloudflare-static-links'],
  app: { baseURL: '/base/' },
  robots: { robotsTxt: false },
  routeRules: {
    '/about': { headers: { 'Content-Signal': 'ai-train=yes' } },
    '/about.md': { headers: { 'CONTENT-SIGNAL': 'search=no' } },
    '/notes/**': { headers: { 'Content-Signal': 'ai-train=no' } },
    '/notes/*.md': { headers: { 'Content-Signal': 'search=no' } },
  },
  nitro: {
    compatibilityDate: '2026-10-08',
    prerender: { routes: ['/notes/1', '/notes/2'] },
    cloudflare: { deployConfig: true },
  },
})
