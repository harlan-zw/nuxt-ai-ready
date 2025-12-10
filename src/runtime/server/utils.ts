import type { HTMLToMarkdownOptions } from 'mdream'
import type { ModulePublicRuntimeConfig } from '../../module'
import { htmlToMarkdown, TagIdMap } from 'mdream'
import { extractionPlugin } from 'mdream/plugins'
import { withMinimalPreset } from 'mdream/preset/minimal'
import { htmlToMarkdownSplitChunks } from 'mdream/splitter'
import { estimateTokenCount } from 'tokenx'

// Replace NBSP (U+00A0) with regular spaces to avoid encoding display issues
function normalizeWhitespace(text: string): string {
  return text.replace(/\u00A0/g, ' ')
}

export function convertHtmlToMarkdownChunks(html: string, url: string, mdreamOptions: ModulePublicRuntimeConfig['mdreamOptions']) {
  let title = ''
  let description = ''
  let updatedAt: string | undefined

  const extractPlugin = extractionPlugin({
    title(el) {
      title = el.textContent
    },
    'meta[name="description"]': (el) => {
      description = el.attributes.content || ''
    },
    'meta[property="article:modified_time"], meta[name="last-modified"], meta[name="updated"], meta[property="og:updated_time"], meta[name="lastmod"]': (el) => {
      if (!updatedAt && el.attributes.content) {
        updatedAt = el.attributes.content
      }
    },
  })

  let options: HTMLToMarkdownOptions = {
    origin: url,
    ...mdreamOptions,
  }

  if (mdreamOptions?.preset === 'minimal') {
    options = withMinimalPreset(options)
    options.plugins = [extractPlugin, ...(options.plugins || [])]
  }
  else {
    options.plugins = [extractPlugin, ...(options.plugins || [])]
  }

  // Single pass for full markdown (keep frontmatter for the full doc)
  const rawMarkdown = htmlToMarkdown(html, options)
  const markdown = normalizeWhitespace(rawMarkdown)

  // Separate pass for chunks (avoids recombination issues)
  const rawChunks = htmlToMarkdownSplitChunks(html, {
    ...options,
    headersToSplitOn: [TagIdMap.h1, TagIdMap.h2, TagIdMap.h3],
    origin: url,
    chunkSize: 512,
    stripHeaders: false,
    lengthFunction(text) {
      return estimateTokenCount(text)
    },
  })

  const chunks = rawChunks.filter((chunk, idx) => {
    // Normalize whitespace in chunk content
    chunk.content = normalizeWhitespace(chunk.content)
    if (idx === 0 && chunk.content.startsWith('---\n')) {
      const endIdx = chunk.content.indexOf('\n---', 4)
      if (endIdx !== -1) {
        chunk.content = chunk.content.slice(endIdx + 4).trimStart()
        return chunk.content.length > 0
      }
    }
    return true
  })

  // Extract headings from chunk metadata
  const headings = chunks.reduce((set, chunk) => {
    Object.entries(chunk.metadata?.headers || {}).forEach(([k, v]) => {
      if (!set[k])
        set[k] = []
      if (v && !set[k].includes(v))
        set[k].push(v)
    })
    return set
  }, {} as Record<string, string[]>)

  return {
    markdown,
    chunks,
    title: normalizeWhitespace(title),
    description: normalizeWhitespace(description),
    headings,
    ...(updatedAt && { updatedAt }),
  }
}
