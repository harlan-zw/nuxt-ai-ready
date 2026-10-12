<script setup lang="ts">
useSeoMeta({
  title: 'Home',
  description: 'The home page of the Nuxt AI Ready basic example.',
})
</script>

<template>
  <main>
    <h1>Nuxt AI Ready Example</h1>
    <p>This site publishes a Markdown version of every page for AI agents.</p>
    <ul>
      <li><a href="/llms.txt">/llms.txt</a> lists the pages on this site.</li>
      <li><a href="/llms-full.txt">/llms-full.txt</a> holds the full Markdown of prerendered pages.</li>
      <li><a href="/about.md">/about.md</a> is the Markdown version of the About page.</li>
    </ul>
    <nav>
      <NuxtLink to="/about">
        About
      </NuxtLink>
    </nav>
  </main>
</template>
