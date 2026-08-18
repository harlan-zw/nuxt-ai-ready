import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  runtimeConfig: {
    // Absolute so the tally lands next to the fixture no matter what cwd the
    // build runs under. Read by server/plugins/prerender-render-counts.ts.
    renderCountsFile: fileURLToPath(new URL('.data/render-counts.json', import.meta.url)),
  },

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/'],
      failOnError: false,
    },
  },

  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for Nuxt AI Search',
  },

  aiReady: {},
})
