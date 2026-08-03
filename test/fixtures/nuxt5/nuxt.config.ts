import NuxtAiReady from 'nuxt-ai-ready'

export default defineNuxtConfig({
  modules: [NuxtAiReady],
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
