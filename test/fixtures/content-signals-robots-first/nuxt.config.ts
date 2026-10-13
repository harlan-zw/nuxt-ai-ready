import Module from '../../../src/module'

// `@nuxtjs/seo` installs `@nuxtjs/robots` before this module. Robots copies
// its options at setup, so anything written to `nuxt.options.robots` later is
// never read. No shared layer here: it would register this module first.
export default defineNuxtConfig({
  modules: ['@nuxtjs/robots', 'nuxt-site-config', '@nuxtjs/sitemap', Module],
  compatibilityDate: '2025-10-15',
  mcp: false,
  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for content signals with robots installed first',
    indexable: true,
  },
  robots: {
    groups: [{ userAgent: ['*'], disallow: ['/private'] }],
  },
  aiReady: {
    contentSignal: {
      aiTrain: false,
      search: true,
      aiInput: true,
    },
  },
})
