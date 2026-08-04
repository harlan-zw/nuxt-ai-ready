<script setup lang="ts">
import { defineRouteRules } from '#app/composables/pages'

defineRouteRules({ isr: 3600 })
</script>

<template>
  <main>
    <h1>ISR page</h1>
  </main>
</template>
