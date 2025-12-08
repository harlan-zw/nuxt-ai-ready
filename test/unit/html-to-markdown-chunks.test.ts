import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TagIdMap } from 'mdream'
import { htmlToMarkdownSplitChunks } from 'mdream/splitter'
import { estimateTokenCount } from 'tokenx'
import { describe, expect, it, vi } from 'vitest'
import { convertHtmlToMarkdownChunks } from '../../src/runtime/server/utils'

describe('hTML to Markdown Chunking', () => {
  const tmpHtml = readFileSync(join(process.cwd(), 'test', 'unit', 'fixture.html'), 'utf-8')

  // add module mock for  #site-config/server/composables/utils
  vi.mock('#site-config/server/composables/utils', () => {
    return {
      withSiteUrl: (url: string) => {
        return `https://example.com${url}`
      },
    }
  })

  it('should extract chunks from tmp.html', () => {
    const out = convertHtmlToMarkdownChunks(tmpHtml, '/foo.md', {
      preset: 'minimal',
    })

    expect(out).toMatchInlineSnapshot(`
      {
        "chunks": [
          {
            "content": "# **Getting Started**

      Welcome to the Nuxt AI Ready module! This guide will help you get up and running with AI-powered content indexing for your Nuxt application.

      ## [Installation](#installation)

      Install the module using your preferred package manager:

      \`\`\`
      pnpm add nuxt-ai-ready
      \`\`\`

      \`\`\`
      npm install nuxt-ai-ready
      \`\`\`

      \`\`\`
      yarn add nuxt-ai-ready
      \`\`\`

      Alternatively, use the Nuxt CLI:

      \`\`\`
      npx nuxi@latest module add nuxt-ai-ready
      \`\`\`",
            "metadata": {
              "headers": {
                "h1": "Getting Started",
                "h2": "Installation",
              },
              "loc": {
                "lines": {
                  "from": 1,
                  "to": 33,
                },
              },
            },
          },
          {
            "content": "## [Configuration](#configuration)

      Add the module to your \`nuxt.config.ts\`:

      \`\`\`
      export default defineNuxtConfig({
        modules: ['nuxt-ai-ready'],

        aiReady: {
          enabled: true,
          debug: false,
          bulk: {
            enabled: true,
            route: '/_ai-ready/bulk',
          },
        },
      })
      \`\`\`",
            "metadata": {
              "headers": {
                "h1": "Getting Started",
                "h2": "Configuration",
              },
              "loc": {
                "lines": {
                  "from": 33,
                  "to": 52,
                },
              },
            },
          },
          {
            "content": "## [What You Get](#what-you-get)

      Once installed, your site automatically gains several AI-friendly features:

      - **Bulk API**: JSONL stream of all your content at \`/_ai-ready/bulk\`
      - **MCP Server**: Integration with AI agents via Model Context Protocol
      - **llms.txt**: AI-friendly site context (via @mdream/nuxt)
      - **Well-Known Discovery**: RFC 8615 compliant discovery endpoint

      All content is automatically indexed at build time with zero configuration required!",
            "metadata": {
              "headers": {
                "h1": "Getting Started",
                "h2": "What You Get",
              },
              "loc": {
                "lines": {
                  "from": 52,
                  "to": 63,
                },
              },
            },
          },
          {
            "content": "## [Next Steps](#next-steps)

      Explore the features and API reference to learn more about what you can do with nuxt-ai-ready.",
            "metadata": {
              "headers": {
                "h1": "Getting Started",
                "h2": "Next Steps",
              },
              "loc": {
                "lines": {
                  "from": 63,
                  "to": 67,
                },
              },
            },
          },
        ],
        "description": "Quick start guide to installing and configuring nuxt-ai-ready in your Nuxt application",
        "headings": {
          "h1": [
            "Getting Started",
          ],
          "h2": [
            "Installation",
            "Configuration",
            "What You Get",
            "Next Steps",
          ],
        },
        "markdown": "# **Getting Started**

      Welcome to the Nuxt AI Ready module! This guide will help you get up and running with AI-powered content indexing for your Nuxt application.

      ## [Installation](#installation)

      Install the module using your preferred package manager:

      \`\`\`
      pnpm add nuxt-ai-ready
      \`\`\`

      \`\`\`
      npm install nuxt-ai-ready
      \`\`\`

      \`\`\`
      yarn add nuxt-ai-ready
      \`\`\`

      Alternatively, use the Nuxt CLI:

      \`\`\`
      npx nuxi@latest module add nuxt-ai-ready
      \`\`\`

      ## [Configuration](#configuration)

      Add the module to your \`nuxt.config.ts\`:

      \`\`\`
      export default defineNuxtConfig({
        modules: ['nuxt-ai-ready'],

        aiReady: {
          enabled: true,
          debug: false,
          bulk: {
            enabled: true,
            route: '/_ai-ready/bulk',
          },
        },
      })
      \`\`\`

      ## [What You Get](#what-you-get)

      Once installed, your site automatically gains several AI-friendly features:

      - **Bulk API**: JSONL stream of all your content at \`/_ai-ready/bulk\`
      - **MCP Server**: Integration with AI agents via Model Context Protocol
      - **llms.txt**: AI-friendly site context (via @mdream/nuxt)
      - **Well-Known Discovery**: RFC 8615 compliant discovery endpoint

      All content is automatically indexed at build time with zero configuration required!

      ## [Next Steps](#next-steps)

      Explore the features and API reference to learn more about what you can do with nuxt-ai-ready.",
        "title": "Getting Started",
      }
    `)
  })

  it('should normalize NBSP to regular spaces', () => {
    // HTML with &nbsp; entities in body content (where they get decoded to U+00A0)
    const htmlWithNbsp = `<!DOCTYPE html>
<html>
<head>
  <title>Test\u00A0Page</title>
  <meta name="description" content="A test description">
</head>
<body>
  <main>
    <h1>Hello&nbsp;World</h1>
    <p>Some&nbsp;text&nbsp;here</p>
  </main>
</body>
</html>`

    const out = convertHtmlToMarkdownChunks(htmlWithNbsp, '/test.md', {
      preset: 'minimal',
    })

    // Title should have regular spaces, not NBSP
    expect(out.title).toBe('Test Page')
    expect(out.title).not.toContain('\u00A0')

    // Markdown content should have regular spaces (mdream decodes &nbsp; to U+00A0)
    expect(out.markdown).not.toContain('\u00A0')

    // Chunks should have regular spaces
    out.chunks.forEach((chunk) => {
      expect(chunk.content).not.toContain('\u00A0')
    })
  })

  it('should use TagIdMap for headersToSplitOn', () => {
    const chunks = htmlToMarkdownSplitChunks(tmpHtml, {
      headersToSplitOn: [TagIdMap.h1, TagIdMap.h2, TagIdMap.h3],
      origin: 'https://example.com',
      chunkSize: 256,
      stripHeaders: false,
      lengthFunction(text: string) {
        return estimateTokenCount(text)
      },
    })
    // Should have headers in metadata
    const hasHeaderMetadata = chunks.some((chunk: any) =>
      chunk.metadata?.headers && Object.keys(chunk.metadata.headers).length > 0,
    )
    expect(hasHeaderMetadata).toBe(true)
  })
})
