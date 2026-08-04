<script setup lang="ts">
import { defineRouteRules } from '#app/composables/pages'

defineRouteRules({ swr: 3600 })
</script>

<template>
  <main>
    <h1>SWR page</h1>
  </main>
</template>
