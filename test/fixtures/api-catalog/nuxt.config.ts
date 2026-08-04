import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../basic'],
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: ['/'],
    },
  },
  aiReady: {
    apiCatalog: {
      entries: [
        {
          anchor: '/api',
          serviceDesc: {
            href: '/openapi.json',
            type: 'application/vnd.oai.openapi+json;version=3.1',
          },
          serviceDoc: { href: '/docs/api', type: 'text/html' },
          status: { href: '/api/health', type: 'application/json' },
        },
      ],
    },
  },
})
