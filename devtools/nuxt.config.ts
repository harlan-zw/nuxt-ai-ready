import { resolve } from 'pathe'

export default defineNuxtConfig({
  extends: ['nuxtseo-layer-devtools'],

  aiReady: false,
  robots: false,
  sitemap: false,
  site: false,
  mcp: false,

  imports: {
    autoImport: true,
  },

  nitro: {
    prerender: {
      routes: ['/', '/llms-txt', '/pages', '/docs'],
    },
    output: {
      publicDir: resolve(__dirname, '../dist/devtools'),
    },
  },

  vite: {
    optimizeDeps: {
      include: [
        '@vueuse/core',
      ],
    },
  },

  app: {
    baseURL: '/__nuxt-ai-ready',
  },
})
