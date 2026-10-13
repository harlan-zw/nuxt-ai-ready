// Prerenders JSON and XML routes next to HTML pages. Only the HTML pages
// may get a Markdown twin or a `.md` header rule.
export default defineNuxtConfig({
  extends: ['../cloudflare-static-links'],
  nitro: {
    prerender: {
      // `/feed.md` asks for a twin of a non-HTML route directly.
      routes: ['/data-feed', '/feed', '/feed.md', '/robots.txt'],
    },
  },
})
