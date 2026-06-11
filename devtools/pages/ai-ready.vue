<script lang="ts" setup>
import { isProductionMode } from 'nuxtseo-layer-devtools/composables/state'
import { computed, watch } from 'vue'
import { navigateTo, useRoute } from '#imports'
import { data, loading, refreshSources } from '../lib/ai-ready/state'
import '../lib/ai-ready/rpc'

const route = useRoute()
const currentTab = computed(() => {
  const path = route.path
  if (path === '/ai-ready/llms-txt')
    return 'llms-txt'
  if (path === '/ai-ready/debug')
    return 'debug'
  if (path === '/ai-ready/docs')
    return 'docs'
  return 'pages'
})

const navItems = [
  { value: 'pages', to: '/ai-ready', icon: 'carbon:list', label: 'Pages', devOnly: false },
  { value: 'llms-txt', to: '/ai-ready/llms-txt', icon: 'carbon:document', label: 'llms.txt', devOnly: false },
  { value: 'debug', to: '/ai-ready/debug', icon: 'carbon:debug', label: 'Debug', devOnly: true },
  { value: 'docs', to: '/ai-ready/docs', icon: 'carbon:book', label: 'Docs', devOnly: false },
]

const runtimeVersion = computed(() => data.value?.version || 'unknown')

// Debug data is dev-only; leave the debug tab when the header switches to Production
watch(isProductionMode, (isProd) => {
  if (isProd && currentTab.value === 'debug')
    return navigateTo('/ai-ready')
})
</script>

<template>
  <DevtoolsLayout
    module-name="nuxt-ai-ready"
    title="AI Ready"
    icon="carbon:bot"
    :version="runtimeVersion"
    :nav-items="navItems"
    github-url="https://github.com/harlan-zw/nuxt-ai-ready"
    :loading="loading"
    :active-tab="currentTab"
    @refresh="refreshSources"
  >
    <NuxtPage />
  </DevtoolsLayout>
</template>
