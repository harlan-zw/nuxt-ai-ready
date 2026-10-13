export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  app: { baseURL: '/registry/' },
  site: { url: 'https://test.example.com', name: 'Test Site' },
  aiReady: { llmsFullTxt: false },
  sitemap: {
    sitemaps: true,
    defaultSitemapsChunkSize: 1,
    includeAppSources: false,
    sources: [],
    urls: ['/about', '/docs/api', '/docs/getting-started'],
  },
})
