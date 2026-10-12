export default defineNuxtConfig({
  modules: ['nuxt-ai-ready'],

  site: {
    url: 'https://example.com',
    name: 'Nuxt AI Ready Example',
    description: 'A small Nuxt site that serves llms.txt and Markdown pages.',
  },

  aiReady: {
    llmsTxt: {
      notes: 'This site is the Nuxt AI Ready basic example.',
    },
  },

  // Prerendered pages appear in llms-full.txt.
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/'],
    },
  },

  compatibilityDate: '2025-01-01',
})
