import { defineNuxtModule } from '@nuxt/kit'
import Module from '../../../src/module'

const LateI18nModule = defineNuxtModule({
  meta: {
    name: 'late-i18n-fixture',
  },
  setup(_options, nuxt) {
    nuxt.hook('nitro:config', (nitro) => {
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
    })
  },
})

export default defineNuxtConfig({
  modules: [Module, LateI18nModule],
  mcp: false,
  site: {
    url: 'https://test.example.com',
  },
})
