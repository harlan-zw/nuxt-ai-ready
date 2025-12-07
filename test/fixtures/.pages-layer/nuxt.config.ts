import { createResolver } from '@nuxt/kit'
import Module from '../../../src/module'

const resolve = createResolver(import.meta.url)

export default defineNuxtConfig({
  modules: [Module, '@nuxtjs/sitemap'],
  alias: {
    'nuxt-ai-index': resolve.resolve('../../../src/module.ts'),
  },
  compatibilityDate: '2025-10-15',
  aiReady: {
    debug: true,
  },
})
