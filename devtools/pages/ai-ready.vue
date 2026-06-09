<script lang="ts" setup>
import type { DevtoolsGlobalData } from '../lib/ai-ready/types'
import { appFetch } from 'nuxtseo-layer-devtools/composables/rpc'
import { productionUrl, refreshTime } from 'nuxtseo-layer-devtools/composables/state'
import { computed, provide, useAsyncData, useNuxtApp, useRoute, watch } from '#imports'
import { GlobalDataKey, GlobalDataStatusKey } from '../lib/ai-ready/types'

const nuxtApp = useNuxtApp()
nuxtApp.payload.data = nuxtApp.payload.data || {}

const { data: globalData, status } = useAsyncData<DevtoolsGlobalData | null>('ai-ready-global-data', () => {
  if (!appFetch.value)
    return Promise.resolve(null)
  return appFetch.value('/__ai-ready/devtools', { responseType: 'json' })
}, {
  watch: [appFetch, refreshTime],
})

// Set production URL from site config for the production toggle
watch(globalData, (val) => {
  if (val?.siteConfigUrl)
    productionUrl.value = val.siteConfigUrl
}, { immediate: true })

provide(GlobalDataKey, globalData)
provide(GlobalDataStatusKey, status)

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
  { value: 'pages', to: '/ai-ready', icon: 'carbon:list', label: 'Pages' },
  { value: 'llms-txt', to: '/ai-ready/llms-txt', icon: 'carbon:document', label: 'llms.txt' },
  { value: 'debug', to: '/ai-ready/debug', icon: 'carbon:debug', label: 'Debug' },
  { value: 'docs', to: '/ai-ready/docs', icon: 'carbon:book', label: 'Docs' },
]

const runtimeVersion = computed(() => globalData.value?.version || 'unknown')
</script>

<template>
  <DevtoolsLayout
    module-name="nuxt-ai-ready"
    title="AI Ready"
    icon="carbon:bot"
    :version="runtimeVersion"
    :nav-items="navItems"
    github-url="https://github.com/harlan-zw/nuxt-ai-ready"
    :loading="status === 'pending'"
    :active-tab="currentTab"
    @refresh="refreshTime = Date.now()"
  >
    <NuxtPage />
  </DevtoolsLayout>
</template>
