import Module from '../../../src/module'

export default defineNuxtConfig({
  modules: [Module],
  compatibilityDate: '2025-10-15',
  site: { name: 'External Reference' },
  sitemap: { zeroPrerender: true },
  robots: { robotsTxt: false },
  aiReady: {
    mcp: false,
    sitemapMd: false,
    llmsFullTxt: false,
    llmsTxt: {
      sections: [
        { title: 'References', links: [{ title: 'External', href: 'https://other.example/llms/reference.txt' }] },
        { title: 'Local pages', sitemap: 'manual', links: [{ title: 'About', href: '/about.md' }] },
      ],
    },
  },
  nitro: { static: true, prerender: { routes: ['/about'], crawlLinks: false, failOnError: true } },
})
