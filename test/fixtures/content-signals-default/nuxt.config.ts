import Module from '../../../src/module'

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  modules: [Module, 'nuxt-site-config', '@nuxtjs/sitemap', '@nuxtjs/robots'],
  compatibilityDate: '2025-10-15',
  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for the default content signals',
    indexable: true,
  },
})
