<script setup lang="ts">
import { useRoute, useSeoMeta } from '#imports'
import { incrementRenderCount } from '../utils/render-counts'

useSeoMeta({
  title: 'Render Count',
  description: 'Embeds how many times this page was SSR rendered.',
})

// Bakes the SSR render count into the page body: the .md twin is converted
// from the first render's HTML, so it must say ssr-renders:1. A second render
// (the pre-reuse double-render behavior) would produce ssr-renders:2.
const renders = import.meta.server ? incrementRenderCount(useRoute().path) : 0
</script>

<template>
  <div>
    <h1>Render Count</h1>
    <p>ssr-renders:{{ renders }}</p>
  </div>
</template>
