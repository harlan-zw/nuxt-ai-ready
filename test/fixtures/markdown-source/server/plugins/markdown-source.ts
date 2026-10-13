import { defineNitroPlugin } from 'nitropack/runtime'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:markdown:source', (context) => {
    if (context.route !== '/about')
      return
    context.source = {
      markdown: `---
name: supplied-source
description: Original source description
meta:
  og:image: https://test.example.com/source-cover.png
---

# Supplied by the host application

Read from the original file, not the rendering.

\`\`\`json
{"@context":"https://schema.org","@type":"Article","headline":"Source metadata"}
\`\`\``,
      title: 'About, from source',
      description: 'Markdown the site already held',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
  })
})
