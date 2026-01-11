import type { H3Event } from 'h3'
import type { HTMLToMarkdownOptions } from 'mdream'
import type { ModulePublicRuntimeConfig } from '../../module'
import type { MarkdownContext } from '../types'
import { getBotInfo } from '@nuxtjs/robots/util'
import { getHeader, getHeaders } from 'h3'
import { htmlToMarkdown } from 'mdream'
import { extractionPlugin } from 'mdream/plugins'
import { withMinimalPreset } from 'mdream/preset/minimal'
import { useNitroApp } from 'nitropack/runtime'

// Replace NBSP (U+00A0) with regular spaces to avoid encoding display issues
export function normalizeWhitespace(text: string): string {
  return text.replace(/\u00A0/g, ' ')
}

interface ExtractedMeta {
  title: string
  description: string
  metaKeywords: string
  headings: Array<Record<string, string>>
  updatedAt?: string
}

// Build mdream options with extraction plugin
function buildMdreamOptions(
  url: string,
  mdreamOptions: ModulePublicRuntimeConfig['mdreamOptions'],
  meta: ExtractedMeta,
  extractUpdatedAt = false,
): HTMLToMarkdownOptions {
  const extractPlugin = extractionPlugin({
    'title': (el) => { meta.title = el.textContent },
    'meta[name="description"]': (el) => { meta.description = el.attributes.content || '' },
    'meta[name="keywords"]': (el) => { meta.metaKeywords = el.attributes.content || '' },
    'h1, h2, h3, h4, h5, h6': (el) => {
      const text = el.textContent?.trim()
      if (text)
        meta.headings.push({ [el.name.toLowerCase()]: text })
    },
    ...(extractUpdatedAt && {
      'meta[property="article:modified_time"], meta[name="last-modified"], meta[name="updated"], meta[property="og:updated_time"], meta[name="lastmod"]': (el) => {
        if (!meta.updatedAt && el.attributes.content)
          meta.updatedAt = el.attributes.content
      },
    }),
  })

  let options: HTMLToMarkdownOptions = { origin: url, ...mdreamOptions }
  if (mdreamOptions?.preset === 'minimal') {
    options = withMinimalPreset(options)
  }
  options.plugins = [extractPlugin, ...(options.plugins || [])]
  return options
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

// Detect if client prefers markdown based on Accept header or AI bot detection
export function clientPrefersMarkdown(event: H3Event): boolean {
  const accept = getHeader(event, 'accept') || ''
  const secFetchDest = getHeader(event, 'sec-fetch-dest') || ''

  // Browsers send sec-fetch-dest header - if it's 'document', it's a browser navigation
  if (secFetchDest === 'document') {
    return false
  }

  // If client accepts text/html, serve HTML (browser behavior)
  if (accept.includes('text/html')) {
    return false
  }

  // Explicit text/markdown request
  if (accept.includes('text/markdown')) {
    return true
  }

  // Check if it's an AI bot via nuxt/robots
  const botInfo = getBotInfo(getHeaders(event))
  if (botInfo?.category === 'ai') {
    return true
  }

  return false
}

// Convert HTML to Markdown (runtime version with hooks)
export async function convertHtmlToMarkdown(html: string, url: string, config: ModulePublicRuntimeConfig, route: string, event: H3Event) {
  const nitroApp = useNitroApp()
  const meta: ExtractedMeta = { title: '', description: '', metaKeywords: '', headings: [] }

  const options = buildMdreamOptions(url, config.mdreamOptions, meta)
  await nitroApp.hooks.callHook('ai-ready:mdreamConfig', options)

  const context: MarkdownContext = {
    html,
    markdown: htmlToMarkdown(html, options),
    route,
    title: meta.title,
    description: meta.description,
    isPrerender: false,
    event,
  }

  await nitroApp.hooks.callHook('ai-ready:markdown', context)

  return {
    markdown: normalizeWhitespace(context.markdown),
    title: normalizeWhitespace(meta.title),
    description: normalizeWhitespace(meta.description),
    headings: meta.headings,
    metaKeywords: meta.metaKeywords,
  }
}

// Convert HTML to Markdown with metadata extraction (prerender version, no hooks)
export function convertHtmlToMarkdownMeta(html: string, url: string, mdreamOptions: ModulePublicRuntimeConfig['mdreamOptions']) {
  const meta: ExtractedMeta = { title: '', description: '', metaKeywords: '', headings: [] }
  const options = buildMdreamOptions(url, mdreamOptions, meta, true)

  return {
    markdown: normalizeWhitespace(htmlToMarkdown(html, options)),
    title: normalizeWhitespace(meta.title),
    description: normalizeWhitespace(meta.description),
    headings: meta.headings,
    metaKeywords: meta.metaKeywords,
    ...(meta.updatedAt && { updatedAt: meta.updatedAt }),
  }
}
