// More prerendered Markdown pages than Cloudflare's 100 `_headers` rules hold.
const notes = Array.from({ length: 110 }, (_, index) => `/notes/${index + 1}`)

export default defineNuxtConfig({
  extends: ['../cloudflare-static-links'],
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: notes,
    },
  },
})
