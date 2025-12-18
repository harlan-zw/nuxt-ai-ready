<script setup lang="ts">
import { useSeoMeta } from '#imports'

useSeoMeta({
  title: 'API Reference - Docs',
  description: 'Complete API documentation for the Nuxt AI Search module including Ask API, Bulk API, and MCP Server endpoints.',
  ogTitle: 'API Reference - Docs',
  ogDescription: 'Complete API documentation for the Nuxt AI Search module including Ask API, Bulk API, and MCP Server endpoints.',
})
</script>

<template>
  <div>
    <h1>API Reference</h1>
    <p>Complete API documentation for the Nuxt AI Search module.</p>

    <h2>Ask API</h2>
    <p>Endpoint: <code>/_ai-search/ask</code></p>

    <h3>Request Body</h3>
    <ul>
      <li><code>query</code> - Search query (required)</li>
      <li><code>mode</code> - Response mode: "list", "generate", or "summarize"</li>
      <li><code>limit</code> - Maximum results (default: 10)</li>
    </ul>

    <h3>Example Request</h3>
    <pre><code>POST /_ai-search/ask
{
  "query": "getting started",
  "mode": "list",
  "limit": 5
}</code></pre>

    <h2>Bulk API</h2>
    <p>Endpoint: <code>/_ai-search/bulk</code></p>
    <p>Returns the complete index in JSONL format for offline processing.</p>

    <h2>MCP Server</h2>
    <p>Endpoint: <code>/_ai-search/mcp</code></p>
    <p>Model Context Protocol server for AI agent integration.</p>

    <p>
      <NuxtLink to="/docs/getting-started">
        Back to Getting Started
      </NuxtLink>
    </p>
  </div>
</template>
