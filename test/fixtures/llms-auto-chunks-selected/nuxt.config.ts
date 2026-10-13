export default defineNuxtConfig({
  extends: ['../llms-auto-chunks'],
  aiReady: { llmsTxt: { sitemaps: ['chunks'], sections: [{ title: 'Pages', sitemap: 'chunks' }] } },
})
