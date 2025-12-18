import type { H3Event } from 'h3'
import type { HTMLToMarkdownOptions } from 'mdream'
import type { ModulePublicRuntimeConfig } from '../../module'
import type { MarkdownContext } from '../types'
import { getHeader } from 'h3'
import { htmlToMarkdown } from 'mdream'
import { extractionPlugin } from 'mdream/plugins'
import { withMinimalPreset } from 'mdream/preset/minimal'
import { useNitroApp } from 'nitropack/runtime'

// Replace NBSP (U+00A0) with regular spaces to avoid encoding display issues
export function normalizeWhitespace(text: string): string {
  return text.replace(/\u00A0/g, ' ')
}

// Check if request should be rendered as markdown
// Returns normalized path and whether it's explicit (.md) or implicit (Accept header)
// Use explicitOnly=true for prerender (only .md extension, no Accept header check)
export function getMarkdownRenderInfo(event: H3Event, explicitOnly = false): { path: string, isExplicit: boolean } | null {
  const originalPath = event.path

  // Never run on API routes or internal routes
  if (originalPath.startsWith('/api') || originalPath.startsWith('/_') || originalPath.startsWith('/@')) {
    return null
  }

  const isExplicit = originalPath.endsWith('.md')

  // For explicitOnly mode (prerender), only handle .md requests
  if (explicitOnly && !isExplicit) {
    return null
  }

  // Extract file extension
  const lastSegment = originalPath.split('/').pop() || ''
  const hasExtension = lastSegment.includes('.')
  const extension = hasExtension ? lastSegment.substring(lastSegment.lastIndexOf('.')) : ''

  // Skip non-.md extensions
  if (hasExtension && extension !== '.md') {
    return null
  }

  const isImplicit = !explicitOnly && clientPrefersMarkdown(event)

  if (!isExplicit && !isImplicit) {
    return null
  }

  // Normalize path
  let path = isExplicit ? originalPath.slice(0, -3) : originalPath
  if (path === '/index') {
    path = '/'
  }

  return { path, isExplicit }
}

// Detect if client prefers markdown based on Accept header
// Clients like Claude Code, Bun, and other API clients typically don't include text/html
export function clientPrefersMarkdown(event: H3Event): boolean {
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

// Convert HTML to Markdown (runtime version with hooks)
export async function convertHtmlToMarkdown(html: string, url: string, config: ModulePublicRuntimeConfig, route: string, event: H3Event) {
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

  await nitroApp.hooks.callHook('ai-ready:mdreamConfig', options)
  let markdown = htmlToMarkdown(html, options)

  const context: MarkdownContext = {
    html,
    markdown,
    route,
    title,
    description,
    isPrerender: false,
    event,
  }

  // Call Nitro runtime hook if available
  await nitroApp.hooks.callHook('ai-ready:markdown', context)
  markdown = normalizeWhitespace(context.markdown) // Use potentially modified markdown
  return { markdown, title: normalizeWhitespace(title), description: normalizeWhitespace(description), headings }
}

// Convert HTML to Markdown with metadata extraction (prerender version, no hooks)
export function convertHtmlToMarkdownMeta(html: string, url: string, mdreamOptions: ModulePublicRuntimeConfig['mdreamOptions']) {
  let title = ''
  let description = ''
  let updatedAt: string | undefined
  const headings: Array<Record<string, string>> = []

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
    'h1, h2, h3, h4, h5, h6': (el) => {
      const text = el.textContent?.trim()
      const level = el.name.toLowerCase()
      if (text)
        headings.push({ [level]: text })
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

  const rawMarkdown = htmlToMarkdown(html, options)
  const markdown = normalizeWhitespace(rawMarkdown)

  return {
    markdown,
    title: normalizeWhitespace(title),
    description: normalizeWhitespace(description),
    headings,
    ...(updatedAt && { updatedAt }),
  }
}
