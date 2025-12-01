<script setup lang="ts">
useSeoMeta({
  title: 'Getting Started - Docs',
  description: 'Learn how to integrate the Nuxt AI Search module into your project with installation instructions, basic configuration, and embedding generation.',
  ogTitle: 'Getting Started - Docs',
  ogDescription: 'Learn how to integrate the Nuxt AI Search module into your project with installation instructions, basic configuration, and embedding generation.',
})
</script>

<template>
  <div>
    <h1>Getting Started</h1>
    <p>Learn how to integrate the Nuxt AI Search module into your project.</p>

    <h2>Installation</h2>
    <p>Install the module using your preferred package manager:</p>
    <pre><code>pnpm add nuxt-ai-search</code></pre>

    <h2>Basic Configuration</h2>
    <p>Add the module to your <code>nuxt.config.ts</code>:</p>
    <pre><code>export default defineNuxtConfig({
  modules: ['nuxt-ai-search'],

  aiSearch: {
    enabled: true,
    embeddings: {
      provider: 'transformers.js',
    }
  }
})</code></pre>

    <h2>Generate Embeddings</h2>
    <p>Run the build command to generate vector embeddings:</p>
    <pre><code>pnpm build</code></pre>

    <p>The module will automatically index your routes and create searchable content.</p>

    <h2>Next Steps</h2>
    <p>
      <NuxtLink to="/docs/api">
        API Reference
      </NuxtLink> - Learn about available endpoints
    </p>
  </div>
</template>
