import NuxtAiReady from 'nuxt-ai-ready-packed'
import NuxtRobots from './modules/robots.ts'
import NuxtSitemap from './modules/sitemap.ts'

export default defineNuxtConfig({
  modules: [NuxtRobots, NuxtSitemap, NuxtAiReady],
  mcp: false,
  aiReady: {
    database: {
      type: 'd1',
    },
  },
  site: {
    url: 'https://nuxt5.example.com',
  },
  runtimeConfig: {
    aiReadyCompatMarker: 'nuxt-5',
  },
  vite: {
    resolve: {
      dedupe: ['nuxt', 'vue', 'vue-router'],
    },
  },
  compatibilityDate: '2026-06-10',
})
