export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  site: { url: 'https://test.example.com', name: 'Custom site' },
  aiReady: { llmsTxt: false, llmsFullTxt: false },
})
