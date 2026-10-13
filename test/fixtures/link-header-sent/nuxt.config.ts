import { defineNuxtConfig } from 'nuxt/config'

// Status-aware Link headers run only with i18n, so this fixture sets it.
export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  site: {
    url: 'https://test.example.com',
    name: 'Test Site',
  },
  routeRules: {
    '/cached': { swr: 60 },
  },
  hooks: {
    'nitro:config'(nitro) {
      const config = nitro.runtimeConfig?.['nuxt-ai-ready']
      if (!config)
        throw new Error('nuxt-ai-ready runtime config is missing')

      config.i18n = {
        defaultLocale: 'en',
        strategy: 'prefix_except_default',
        locales: [
          { code: 'en', hreflang: 'en' },
          { code: 'fr', hreflang: 'fr' },
        ],
      }
    },
  },
})
