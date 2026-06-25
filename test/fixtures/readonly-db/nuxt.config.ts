export default defineNuxtConfig({
  extends: ['../.pages-layer'],

  site: {
    url: 'https://test.example.com',
    name: 'Readonly DB Test',
    description: 'Test site reproducing nuxt/scripts#818',
  },

  // No nitro.prerender: pages are served by SSR, so /llms-full.txt is handled at
  // runtime and reads the database (the scripts.nuxt.com deployment shape).
  // database.type/filename are supplied by the test so it can point at a
  // read-only path.
  aiReady: {},
})
