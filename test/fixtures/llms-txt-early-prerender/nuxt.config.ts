export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  site: { url: 'https://test.example.com' },
  nitro: {
    static: true,
    prerender: {
      routes: ['/llms.txt', '/about'],
      crawlLinks: false,
      concurrency: 1,
    },
  },
})
