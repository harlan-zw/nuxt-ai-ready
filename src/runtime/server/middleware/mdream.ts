import type { H3Event } from 'h3'
import type { HTMLToMarkdownOptions } from 'mdream'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { MarkdownContext } from '../../types'
import { withSiteUrl } from '#site-config/server/composables/utils'
import { createError, defineEventHandler, getHeader, setHeader } from 'h3'
import { htmlToMarkdown, TagIdMap } from 'mdream'
import { extractionPlugin } from 'mdream/plugins'
import { withMinimalPreset } from 'mdream/preset/minimal'
import { htmlToMarkdownSplitChunksStream } from 'mdream/splitter'
import { useNitroApp, useRuntimeConfig } from 'nitropack/runtime'
import { estimateTokenCount } from 'tokenx'
import { logger } from '../logger'

// Detect if client prefers markdown based on Accept header
// Clients like Claude Code, Bun, and other API clients typically don't include text/html
function shouldServeMarkdown(event: H3Event): boolean {
  const accept = getHeader(event, 'accept') || ''
  const secFetchDest = getHeader(event, 'sec-fetch-dest') || ''

  // Browsers send sec-fetch-dest header - if it's 'document', it's a browser navigation
  // We should NOT serve markdown in that case
  if (secFetchDest === 'document') {
    return false
  }

  // Must NOT include text/html (excludes browsers)
  if (accept.includes('text/html')) {
    return false
  }

  // Must explicitly opt-in with either */* or text/markdown
  // This catches API clients like Claude Code (axios with application/json, text/plain, */*)
  return accept.includes('*/*') || accept.includes('text/markdown')
}

// Convert HTML to Markdown
async function convertHtmlToMarkdown(html: string, url: string, config: ModulePublicRuntimeConfig, route: string, event: H3Event) {
  const nitroApp = useNitroApp()

  let title = ''
  let description = ''
  const headings: Array<Record<string, string>> = []

  // Create extraction plugin first - must run before isolateMainPlugin
  const extractPlugin = extractionPlugin({
    title(el) {
      title = el.textContent
    },
    'meta[name="description"]': (el) => {
      description = el.attributes.content || ''
    },
    'h1, h2, h3, h4, h5, h6': (el) => {
      const text = el.textContent?.trim()
      const level = el.name.toLowerCase()
      if (text)
        headings.push({ [level]: text })
    },
  })

  let options: HTMLToMarkdownOptions = {
    origin: url,
    ...config.mdreamOptions,
  }

  // Apply preset if specified
  if (config.mdreamOptions?.preset === 'minimal') {
    options = withMinimalPreset(options)
    // Manually insert extraction plugin at the beginning, before all preset plugins
    options.plugins = [extractPlugin, ...(options.plugins || [])]
  }
  else {
    // For non-preset mode, just add extraction plugin to existing plugins
    options.plugins = [extractPlugin, ...(options.plugins || [])]
  }

  // @ts-expect-error untyped
  await nitroApp.hooks.callHook('ai-ready:mdreamConfig', options)
  let markdown = htmlToMarkdown(html, options)

  const context: MarkdownContext = {
    html,
    markdown,
    route,
    title,
    description,
    isPrerender: Boolean(import.meta.prerender),
    event,
  }

  // Call Nitro runtime hook if available
  // @ts-expect-error untyped
  await nitroApp.hooks.callHook('ai-ready:markdown', context)
  markdown = context.markdown // Use potentially modified markdown
  return { markdown, title, description, headings }
}

// Convert HTML to Markdown chunks for prerender
async function convertHtmlToMarkdownChunks(html: string, url: string, config: ModulePublicRuntimeConfig) {
  let title = ''
  let description = ''
  const headings: Array<Record<string, string>> = []

  // Create extraction plugin first
  const extractPlugin = extractionPlugin({
    title(el) {
      title = el.textContent
    },
    'meta[name="description"]': (el) => {
      description = el.attributes.content || ''
    },
    'h1, h2, h3, h4, h5, h6': (el) => {
      const text = el.textContent?.trim()
      const level = el.name.toLowerCase()
      if (text)
        headings.push({ [level]: text })
    },
  })

  let options: HTMLToMarkdownOptions = {
    origin: url,
    ...config.mdreamOptions,
  }

  // Apply preset if specified
  if (config.mdreamOptions?.preset === 'minimal') {
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

  return { chunks, title, description, headings }
}

export default defineEventHandler(async (event) => {
  let path = event.path
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig

  // never run on API routes or internal routes
  if (path.startsWith('/api') || path.startsWith('/_') || path.startsWith('/@')) {
    return
  }

  // Extract file extension from path (e.g., /file.js -> .js, /path/to/file.css -> .css)
  const lastSegment = path.split('/').pop() || ''
  const hasExtension = lastSegment.includes('.')
  const extension = hasExtension ? lastSegment.substring(lastSegment.lastIndexOf('.')) : ''

  // Only run on .md extension or no extension at all
  // Skip all other file extensions (.js, .css, .html, .json, etc.)
  if (hasExtension && extension !== '.md') {
    return
  }

  // Check if we should serve markdown based on Accept header or .md extension
  const hasMarkdownExtension = path.endsWith('.md')
  const clientPrefersMarkdown = shouldServeMarkdown(event)

  // Early exit: skip if not requesting .md and client doesn't prefer markdown
  if (!hasMarkdownExtension && !clientPrefersMarkdown) {
    return
  }

  // Remove .md extension if present
  if (hasMarkdownExtension) {
    path = path.slice(0, -3)
  }

  // Special handling for index.md -> /
  if (path === '/index') {
    path = '/'
  }

  let html: string

  // Fetch the HTML page
  try {
    const response = await event.fetch(path)

    // Check if response is successful
    if (!response.ok) {
      if (hasMarkdownExtension) {
        return createError({
          statusCode: response.status,
          statusMessage: response.statusText,
          message: `Failed to fetch HTML for ${path}`,
        })
      }
      return
    }

    // Check content-type is HTML
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      if (hasMarkdownExtension) {
        return createError({
          statusCode: 415,
          statusMessage: 'Unsupported Media Type',
          message: `Expected text/html but got ${contentType} for ${path}`,
        })
      }
      return
    }

    html = await response.text() as string
  }
  catch (e) {
    logger.error(`Failed to fetch HTML for ${path}`, e)
    if (hasMarkdownExtension) {
      return createError({
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        message: `Failed to fetch HTML for ${path}`,
      })
    }
    return
  }
  if (import.meta.prerender) {
    // During prerender, generate chunks for bulk JSONL processing
    const result = await convertHtmlToMarkdownChunks(
      html,
      withSiteUrl(event, path),
      config,
    )
    // return JSON which will be transformed by the build hooks
    return JSON.stringify(result)
  }

  // Runtime: convert to markdown
  const result = await convertHtmlToMarkdown(
    html,
    withSiteUrl(event, path),
    config,
    path,
    event,
  )
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')

  // Set cache headers
  if (config.markdownCacheHeaders) {
    const { maxAge, swr } = config.markdownCacheHeaders
    const cacheControl = swr
      ? `public, max-age=${maxAge}, stale-while-revalidate=${maxAge}`
      : `public, max-age=${maxAge}`
    setHeader(event, 'cache-control', cacheControl)
  }

  // Return markdown
  return result.markdown
})
