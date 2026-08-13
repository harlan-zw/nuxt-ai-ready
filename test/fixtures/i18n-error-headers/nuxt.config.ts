import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['../basic'],
  aiReady: {
    apiCatalog: {
      entries: [{
        anchor: '/api',
        serviceDesc: { href: '/openapi.json' },
      }],
    },
  },
  hooks: {
    'nitro:config'(nitro) {
      const config = nitro.runtimeConfig?.['nuxt-ai-ready']
      if (!config)
        throw new Error('nuxt-ai-ready runtime config is missing')

      config.i18n = {
        defaultLocale: 'nb',
        strategy: 'prefix_except_default',
        locales: [
          { code: 'nb', hreflang: 'nb-NO' },
          { code: 'en', hreflang: 'en' },
        ],
        pages: {
          supabasePwn: {
            nb: '/verktoy/supabase-pwn',
            en: '/tools/supabase-pwn',
          },
        },
      }
    },
  },
})
