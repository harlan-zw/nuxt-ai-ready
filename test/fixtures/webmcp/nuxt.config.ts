import { createResolver } from '@nuxt/kit'
import Module from '../../../src/module'

const resolve = createResolver(import.meta.url)

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  modules: [Module, 'nuxt-site-config', '@nuxtjs/sitemap', '@nuxtjs/robots', '@nuxtjs/mcp-toolkit'],
  alias: {
    'nuxt-ai-index': resolve.resolve('../../../src/module.ts'),
  },
  compatibilityDate: '2025-10-15',
  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
    description: 'Test site for WebMCP',
  },
  mcp: {
    enabled: true,
  },
  nitro: {
    prerender: {
      routes: ['/about'],
    },
  },
  aiReady: {
    tools: {
      listPages: {
        defaultLimit: 7,
        webmcp: { enabled: false },
      },
      searchPages: {
        defaultLimit: 5,
        mcp: { enabled: false },
        webmcp: { maxOutputChars: 500 },
      },
      getPageMarkdown: {
        webmcp: { maxOutputChars: 500 },
      },
    },
    webmcp: true,
  },
})
