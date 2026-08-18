<script setup lang="ts">
import { useSeoMeta } from '#imports'

useSeoMeta({
  title: 'Comark Fixture',
  description: 'Links every docs page so the prerender crawl reaches them.',
})
</script>

<template>
  <div>
    <h1>Comark Fixture</h1>
    <nav>
      <ul>
        <li><NuxtLink to="/docs/getting-started">Getting Started</NuxtLink></li>
        <li><NuxtLink to="/docs/api">API</NuxtLink></li>
        <li><NuxtLink to="/docs/components">Components</NuxtLink></li>
      </ul>
    </nav>
  </div>
</template>
