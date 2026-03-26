<script lang="ts" setup>
import type { DevtoolsGlobalData } from './composables/types'
import { computed, provide, useAsyncData, useNuxtApp, useRoute, watch } from '#imports'
import { appFetch } from 'nuxtseo-layer-devtools/composables/rpc'
import { productionUrl, refreshTime } from 'nuxtseo-layer-devtools/composables/state'
import { GlobalDataKey, GlobalDataStatusKey } from './composables/types'

const nuxtApp = useNuxtApp()
nuxtApp.payload.data = nuxtApp.payload.data || {}

const { data: globalData, status } = useAsyncData<DevtoolsGlobalData | null>('global-data', () => {
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
  if (path === '/llms-txt')
    return 'llms-txt'
  if (path === '/pages')
    return 'pages'
  if (path === '/docs')
    return 'docs'
  return 'overview'
})

const navItems = [
  { value: 'overview', to: '/', icon: 'carbon:dashboard', label: 'Overview' },
  { value: 'llms-txt', to: '/llms-txt', icon: 'carbon:document', label: 'llms.txt' },
  { value: 'pages', to: '/pages', icon: 'carbon:list', label: 'Pages' },
  { value: 'docs', to: '/docs', icon: 'carbon:book', label: 'Docs' },
]

const runtimeVersion = computed(() => globalData.value?.version || 'unknown')
</script>

<template>
  <DevtoolsLayout
    module-name="nuxt-ai-ready"
    title="AI Ready"
    icon="carbon:machine-learning-model"
    :version="runtimeVersion"
    :nav-items="navItems"
    github-url="https://github.com/nuxt-seo-pro/nuxt-ai-ready"
    :loading="status === 'pending'"
    :active-tab="currentTab"
    @refresh="refreshTime = Date.now()"
  >
    <NuxtPage />
  </DevtoolsLayout>
</template>
