import type { DevtoolsGlobalData } from './types'
import { appFetch } from 'nuxtseo-layer-devtools/composables/rpc'
import { productionUrl, refreshTime } from 'nuxtseo-layer-devtools/composables/state'
import { ref, watch } from 'vue'

export const data = ref<DevtoolsGlobalData | null>(null)
export const loading = ref(true)

export async function refreshSources() {
  if (!appFetch.value || typeof appFetch.value !== 'function')
    return
  data.value = await appFetch.value('/__ai-ready__/debug.json', { responseType: 'json' }).catch(() => {
    // The devtools host can disconnect while a refresh is in flight.
    return null
  })
  loading.value = false
  if (data.value?.siteConfigUrl)
    productionUrl.value = data.value.siteConfigUrl
}

// Re-fetch the global debug data when the host connection or manual refresh changes
watch([appFetch, refreshTime], () => {
  refreshSources()
})
