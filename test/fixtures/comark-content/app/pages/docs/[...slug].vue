<script setup lang="ts">
import { useAsyncData, useRoute, useSeoMeta } from '#imports'

interface DocsPage {
  title?: string
  description?: string
  body?: unknown
}

const route = useRoute()
const { data: page } = await useAsyncData(
  `docs-${route.path}`,
  () => $fetch('/api/docs', { query: { path: route.path } }) as Promise<DocsPage | null>,
)

useSeoMeta({
  title: () => page.value?.title || '',
  description: () => page.value?.description || '',
})
</script>

<template>
  <!-- ContentRenderer is a global component registered by comark. -->
  <article v-if="page">
    <ContentRenderer :value="page" />
  </article>
</template>
