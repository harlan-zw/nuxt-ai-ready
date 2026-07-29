import { createResolver } from '@nuxt/kit'
import Module from '../../../src/module'

const { resolve } = createResolver(import.meta.url)

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  modules: [Module, 'nuxt-site-config', '@nuxtjs/sitemap', '@nuxtjs/robots', '@nuxtjs/mcp-toolkit'],
  alias: {
    'nuxt-ai-index': resolve('../../../src/module.ts'),
  },
  compatibilityDate: '2025-10-15',
  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
  },
  mcp: {
    enabled: false,
  },
})
