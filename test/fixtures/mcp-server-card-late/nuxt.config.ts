import { defineNuxtModule } from '@nuxt/kit'

const LateMcpHost = defineNuxtModule({
  meta: { name: 'late-mcp-host' },
  moduleDependencies: {
    '@nuxtjs/mcp-toolkit': {
      version: '>=0.18.0',
    },
  },
})

const SeoProObserver = defineNuxtModule({
  meta: { name: 'seo-pro-observer' },
  setup(_options, nuxt) {
    nuxt.hook('modules:done', async () => {
      const modules = [{ name: 'nuxt-ai-ready', features: {} as Record<string, unknown> }]
      await nuxt.callHook('nuxt-seo-pro:modules' as any, modules)
      nuxt.options.runtimeConfig.mcpSeoProFeature = modules[0]?.features.mcp
    })
  },
})

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  modules: [LateMcpHost, SeoProObserver],
  site: {
    url: 'https://late-mcp.example.com/',
    name: 'Late MCP Site',
    description: 'Late dependency integration fixture.',
  },
  mcp: {
    enabled: true,
    route: '/agent/mcp',
    name: 'Late Toolkit Server',
    version: '2.4.0',
    description: 'MCP server installed by a later wrapper module.',
    instructions: 'Read resources before calling tools.',
  },
  nitro: {
    prerender: {
      routes: ['/', '/about'],
    },
  },
  aiReady: {
    mcpServerCard: {
      title: 'Late MCP discovery',
      documentationUrl: 'https://late-mcp.example.com/mcp-docs',
      cacheMaxAge: 900,
    },
  },
})
