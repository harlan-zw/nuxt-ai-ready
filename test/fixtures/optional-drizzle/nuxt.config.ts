// The e2e suites copy this fixture outside the repository, so it names the
// module by package and resolves it from the consumer's node_modules.
export default defineNuxtConfig({
  modules: ['nuxt-ai-ready'],
  compatibilityDate: '2025-10-15',
  site: {
    url: 'https://test.example.com',
    name: 'Storage Free',
    description: 'A site without the page database.',
  },
})
