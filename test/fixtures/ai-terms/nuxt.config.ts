export default defineNuxtConfig({
  extends: ['../basic'],
  modules: ['@nuxtjs/robots'],
  aiReady: {
    database: false,
    aiTerms: {
      updated: '2026-11-18',
      default: 'deny',
      uses: {
        search: { access: 'allow', attribution: 'required' },
        answer: { access: 'allow', attribution: 'required' },
        training: { access: 'deny' },
        agent: { access: 'allow' },
      },
      paths: [{ match: '/members/*', uses: { agent: { access: 'deny' } } }],
    },
    apiCatalog: {
      entries: [{ anchor: '/api', serviceDoc: { href: '/docs/api' } }],
    },
  },
  nitro: { prerender: { crawlLinks: false, routes: ['/', '/robots.txt'] } },
})
