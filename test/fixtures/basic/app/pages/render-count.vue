<script setup lang="ts">
import { useRoute, useSeoMeta } from '#imports'
import { incrementRenderCount } from '../utils/render-counts'

// Bakes the SSR render count into the page body and metadata. The static .md
// file verifies the initial HTML handoff, while llms.txt verifies the sitemap
// crawl did not render the page again after that handoff was consumed.
const renders = import.meta.server ? incrementRenderCount(useRoute().path) : 0

useSeoMeta({
  title: 'Render Count',
  description: `Embeds how many times this page was SSR rendered: ssr-renders:${renders}.`,
})
</script>

<template>
  <div>
    <h1>Render Count</h1>
    <p>ssr-renders:{{ renders }}</p>
  </div>
</template>
