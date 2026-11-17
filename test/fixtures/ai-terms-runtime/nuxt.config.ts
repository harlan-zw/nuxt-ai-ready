export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  site: { url: 'https://test.example.com' },
  app: { baseURL: '/docs/' },
  robots: { robotsTxt: false },
  aiReady: {
    database: false,
    aiTerms: {
      updated: '2026-11-18',
      default: 'deny',
      uses: {
        search: { access: 'allow', attribution: 'required' },
        answer: { access: 'allow' },
        training: { access: 'deny' },
        agent: { access: 'allow' },
      },
    },
  },
})
