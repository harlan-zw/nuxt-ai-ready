export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  site: { url: 'https://test.example.com', name: 'Test Site', description: 'Sitemap discovery' },
  aiReady: {
    llmsFullTxt: false,
    llmsTxt: {
      markdownLinks: true,
      maxLength: 1024,
      sitemaps: ['pages', 'skills'],
      sections: [{ title: 'Skills', sitemap: 'skills', path: '/llms/skills.txt' }],
    },
  },
  sitemap: {
    sources: [],
    sitemaps: {
      pages: { urls: ['/about'], includeAppSources: false },
      skills: { urls: Array.from({ length: 80 }, (_, i) => `/skill-${i}`), includeAppSources: false, chunks: 20 },
      retired: { urls: ['/retired'], includeAppSources: false },
    },
  },
})
