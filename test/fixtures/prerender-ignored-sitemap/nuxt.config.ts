export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  site: { url: 'https://test.example.com' },
  sitemap: {
    includeAppSources: false,
    urls: ['/about', '/ignored-prefix', '/ignored-regex', '/ignored-function'],
  },
  nitro: {
    prerender: {
      routes: ['/about'],
      crawlLinks: false,
      ignore: [
        '/ignored-prefix',
        /^\/ignored-regex\/?$/,
        path => path === '/ignored-function.md',
      ],
    },
  },
})
