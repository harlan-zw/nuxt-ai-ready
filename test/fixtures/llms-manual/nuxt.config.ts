export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  site: { url: 'https://test.example.com', name: 'Manual site' },
  aiReady: { llmsFullTxt: false },
  nitro: { prerender: { routes: ['/about'], crawlLinks: false } },
})
