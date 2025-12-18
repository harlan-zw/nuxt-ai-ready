<script setup lang="ts">
import { useSeoMeta } from '#imports'

useSeoMeta({
  title: 'About · Test Site — UTF-8 Support',
  description: 'Learn about this test site demonstrating Nuxt AI Search module capabilities for end-to-end testing across different deployment environments.',
  ogTitle: 'About · Test Site — UTF-8 Support',
  ogDescription: 'Learn about this test site demonstrating Nuxt AI Search module capabilities for end-to-end testing across different deployment environments.',
})
</script>

<template>
  <div>
    <h1>About · Test Site — UTF-8 Support</h1>
    <p>This test site demonstrates the Nuxt AI Search module capabilities with proper UTF-8 encoding: é, ñ, 中文, emoji 🚀, and special chars like "quotes" & 'apostrophes'.</p>

    <h2>Purpose</h2>
    <p>
      This site is used for end-to-end testing of the module across different
      deployment environments including standard Node.js and Cloudflare Workers.
    </p>

    <h2>Technology Stack</h2>
    <ul>
      <li>Nuxt 3 - Vue.js framework</li>
      <li>AI SDK - Embedding generation</li>
      <li>SQLite - Vector storage</li>
      <li>Transformers.js - Local embeddings</li>
    </ul>

    <p>
      <NuxtLink to="/">
        Back to Home
      </NuxtLink>
    </p>
  </div>
</template>
