import { createResolver } from '@nuxt/kit'
import Module from '../../../src/module'

const resolve = createResolver(import.meta.url)

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  modules: [Module, 'nuxt-site-config', '@nuxtjs/sitemap', '@nuxtjs/robots'],
  alias: {
    'nuxt-ai-index': resolve.resolve('../../../src/module.ts'),
  },
  compatibilityDate: '2025-10-15',
  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for content signals',
    // Enable indexable so robots.txt works properly in tests
    indexable: true,
  },
  robots: {
    // Ensure robots module is in production mode for testing
    enabled: true,
  },
  aiReady: {
    contentSignal: {
      aiTrain: true,
      search: true,
      aiInput: false,
    },
  },
})
