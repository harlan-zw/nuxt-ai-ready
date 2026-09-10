import Module from '../../../src/module'

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  app: {
    baseURL: '/docs/',
  },
  modules: [Module, 'nuxt-site-config', '@nuxtjs/sitemap', '@nuxtjs/robots'],
  compatibilityDate: '2025-10-15',
  site: {
    url: 'https://test.example.com',
    name: 'Agent Skills Test',
  },
  aiReady: {
    agentSkills: {
      skills: [
        {
          source: 'local',
          name: 'seo-audit',
          description: 'Audit a site for critical SEO issues.',
          file: './skills/seo-audit/SKILL.md',
          alias: '/SKILL.md',
        },
        {
          source: 'external',
          name: 'seo-toolkit',
          type: 'archive',
          description: 'Use the complete SEO toolkit and its supporting resources.',
          url: 'https://cdn.example.com/seo-toolkit.tar.gz',
          digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ],
    },
  },
  robots: {
    robotsTxt: false,
  },
  nitro: {
    prerender: {
      // A site may prerender an artifact so static hosts and link checkers
      // see the file. The bytes must survive the markdown twin pipeline.
      routes: ['/SKILL.md', '/skills/site-review/SKILL.md'],
    },
  },
})
