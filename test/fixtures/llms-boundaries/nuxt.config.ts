export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  site: { url: 'https://example.com', name: 'Boundary Test' },
  aiReady: {
    llmsFullTxt: false,
    llmsTxt: {
      sections: [{ title: 'Pages', sitemap: 'sitemap', path: '/llms/pages.txt' }],
    },
  },
  sitemap: {
    sources: [],
    includeAppSources: false,
    urls: ['/about', '/../about', '/../../about', '/%2e%2e/about', '/%252e%252e/about', 'https://example.com/../../about'],
  },
  robots: { robotsTxt: false },
  nitro: { static: true, prerender: { routes: ['/about'], crawlLinks: false, failOnError: true } },
})
