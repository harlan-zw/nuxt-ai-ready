<script setup lang="ts">
import { useWebMcpSupported } from '#ai-ready/app'

const supported = useWebMcpSupported()
</script>

<template>
  <main>
    <h1>Nuxt 5 compatibility</h1>
    <p id="alias-app">{{ supported }}</p>
  </main>
</template>
