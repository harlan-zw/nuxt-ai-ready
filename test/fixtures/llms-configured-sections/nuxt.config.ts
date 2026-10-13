export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  site: { url: 'https://test.example.com', name: 'Test Site' },
  aiReady: {
    llmsFullTxt: false,
    llmsTxt: {
      pages: false,
      maxLength: 1024,
      sections: [...[false, true].map(optional => ({
        title: optional ? 'Optional Skills' : 'Skills',
        description: 'Install these skills.',
        optional,
        links: Array.from({ length: 40 }, (_, i) => ({
          title: `Skill ${i}`,
          href: `https://resources.example.com/${optional ? 'optional' : 'required'}-${i}`,
          description: 'Complete instructions: '.repeat(10),
        })),
      })), ...Array.from({ length: 25 }, (_, i) => ({ title: `Context ${i}`, description: [`First paragraph ${i}.`, `Second paragraph ${i}.`] })), { title: 'Ignored context', optional: true, description: 'Hidden optional context.' }, { title: 'Selected pages', sitemap: 'sitemap', path: '/llms/Skills.TXT' }],
    },
  },
})
