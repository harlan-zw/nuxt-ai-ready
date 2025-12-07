import type { HTMLToMarkdownOptions } from 'mdream'
import type { ModulePublicRuntimeConfig } from '../../module'
import { TagIdMap } from 'mdream'
import { extractionPlugin } from 'mdream/plugins'
import { withMinimalPreset } from 'mdream/preset/minimal'
import { htmlToMarkdownSplitChunksStream } from 'mdream/splitter'
import { estimateTokenCount } from 'tokenx'

export async function convertHtmlToMarkdownChunks(html: string, url: string, mdreamOptions: ModulePublicRuntimeConfig['mdreamOptions']) {
  let title = ''
  let description = ''
  let updatedAt: string | undefined
  // Create extraction plugin first
  const extractPlugin = extractionPlugin({
    title(el) {
      title = el.textContent
    },
    'meta[name="description"]': (el) => {
      description = el.attributes.content || ''
    },
    // Extract timestamp from various meta tag formats
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

  // Apply preset if specified
  if (mdreamOptions?.preset === 'minimal') {
    options = withMinimalPreset(options)
    options.plugins = [extractPlugin, ...(options.plugins || [])]
  }
  else {
    options.plugins = [extractPlugin, ...(options.plugins || [])]
  }

  const chunksStream = htmlToMarkdownSplitChunksStream(html, {
    ...options,
    headersToSplitOn: [TagIdMap.h1, TagIdMap.h2, TagIdMap.h3],
    origin: url,
    chunkSize: 256,
    stripHeaders: false,
    lengthFunction(text) {
      return estimateTokenCount(text)
    },
  })

  const chunks = []
  for await (const chunk of chunksStream) {
    chunks.push(chunk)
  }

  // compute headings from chunk meta
  return {
    chunks,
    title,
    description,
    ...(updatedAt && { updatedAt }),
    headings: chunks.reduce((set, m) => {
      Object.entries(m.metadata?.headers || {}).forEach(([k, v]) => {
        // should be an array of unique values
        if (!set[k])
          set[k] = []
        if (v && !set[k].includes(v))
          set[k].push(v)
      })
      return set
    }, {} as Record<string, string[]>),
  }
}
