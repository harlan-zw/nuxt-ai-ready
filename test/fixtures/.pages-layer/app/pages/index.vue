<script setup lang="ts">
useSeoMeta({
  title: 'Welcome to Test Site',
  description: 'A test site for the Nuxt AI Search module featuring AI-powered semantic search, vector embeddings, and MCP protocol support.',
  ogTitle: 'Welcome to Test Site',
  ogDescription: 'A test site for the Nuxt AI Search module featuring AI-powered semantic search, vector embeddings, and MCP protocol support.',
})
</script>

<template>
  <div>
    <h1>Welcome to Test Site</h1>
    <p>This is a test site for the Nuxt AI Search module.</p>

    <h2>Features</h2>
    <ul>
      <li>AI-powered semantic search</li>
      <li>Vector embeddings for content</li>
      <li>MCP protocol support</li>
      <li>Well-known endpoint discovery</li>
    </ul>

    <nav>
      <ul>
        <li>
          <NuxtLink to="/about">
            About
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/docs/getting-started">
            Getting Started
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/missing">
            404 link
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/llms.txt">
            /llms.txt
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/llms-full.txt">
            /llms-full.txt
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/docs/api">
            API Reference
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/docs/foo/bar">
            /docs/foo/bar.md
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
