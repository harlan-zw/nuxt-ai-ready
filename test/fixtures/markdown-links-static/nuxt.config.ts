import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../basic'],
  app: {
    baseURL: '/docs/',
  },
  aiReady: {
    llmsTxt: {
      markdownLinks: true,
    },
  },
  robots: {
    robotsTxt: false,
  },
  sitemap: {
    // One /docs segment is the app base; the other belongs to the logical route.
    urls: ['/guide.html', '/legacy/', '/docs/docs/ignored/', '/docs/docs/published/', '/docs/docs/space route/'],
  },
  nitro: {
    static: true,
    ignore: ['**/ignored.md'],
    prerender: {
      crawlLinks: true,
      routes: ['/', '/about/', '/docs/getting-started', '/docs/api'],
      failOnError: false,
    },
  },
  hooks: {
    'nitro:init': (nitro) => {
      nitro.hooks.hook('prerender:generate', (route) => {
        if (route.route === '/docs/api.md')
          route.skip = true
      })
    },
  },
})
