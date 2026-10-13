export default defineNuxtConfig({
  extends: ['../basic'],
  aiReady: {
    llmsTxt: {
      sections: [{ title: 'Docs', sitemap: 'pages', path: '/llms/docs.txt' }],
    },
  },
  sitemap: {
    sitemaps: { pages: { urls: ['/about', '/docs/api'] } },
  },
  nitro: {
    prerender: { routes: [], crawlLinks: false },
    routeRules: { '/llms-txt/**': { swr: 3600 } },
  },
})
