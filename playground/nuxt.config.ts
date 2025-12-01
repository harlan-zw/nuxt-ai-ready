export default defineNuxtConfig({
  extends: ['../test/fixtures/.pages-layer'],

  modules: [
    '@nuxt/ui',
    '@nuxt/content',
    'nuxt-site-config',
    '@nuxtjs/sitemap',
    '@nuxtjs/mcp-toolkit',
  ],

  // css: ['~/assets/css/main.css'],

  site: {
    url: 'https://example.com',
    name: 'Minimal AI Ready Demo',
    description: 'Showcase of nuxt-ai-ready core features',
  },

  compatibilityDate: '2024-07-07',

  devtools: { enabled: true },

  // MCP Toolkit config
  mcp: {
    enabled: true,
    route: '/mcp',
    name: 'Minimal AI Ready Demo',
  },

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/'],
    },
  },
})
