export default defineNuxtConfig({
  extends: ['../basic'],
  nitro: { prerender: { routes: [], crawlLinks: false } },
})
