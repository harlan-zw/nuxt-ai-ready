<script setup lang="ts">
useSeoMeta({
  title: 'About',
  description: 'What the Nuxt AI Ready basic example shows.',
})
</script>

<template>
  <main>
    <h1>About</h1>
    <p>Nuxt AI Ready converts each rendered page to Markdown.</p>
    <h2>Try It</h2>
    <p>Add <code>.md</code> to a page URL to read its Markdown version.</p>
    <p>Send <code>Accept: text/markdown</code> to a page URL to receive the same Markdown.</p>
    <NuxtLink to="/">
      Back to Home
    </NuxtLink>
  </main>
</template>
