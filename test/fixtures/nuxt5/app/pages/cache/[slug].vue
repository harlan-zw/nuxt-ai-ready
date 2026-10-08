<script setup lang="ts">
import { useState } from '#imports'

const token = useState('render-token', () => crypto.randomUUID())
</script>

<template>
  <main :data-render-token="token">
    <h1>Cached negotiation</h1>
    <p>HTML and Markdown requests share one public page with separate representation URLs.</p>
  </main>
</template>
