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

const RE_NBSP = /\u00A0/g

// Replace NBSP (U+00A0) with regular spaces to avoid encoding display issues
function normalizeWhitespace(text: string): string {
  return text.replace(RE_NBSP, ' ')
}

interface ExtractedMeta {
  title: string
  description: string
  metaKeywords: string
  headings: Array<Record<string, string>>
  updatedAt?: string
  textContent: string[]
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
    'p, li, td, th, blockquote, figcaption': (el) => {
      const text = el.textContent?.trim()
      if (text)
        meta.textContent.push(text)
    },
    ...(extractUpdatedAt && {
      'meta[property="article:modified_time"], meta[name="last-modified"], meta[name="updated"], meta[property="og:updated_time"], meta[name="lastmod"]': (el) => {
        if (!meta.updatedAt && el.attributes.content)
          meta.updatedAt = el.attributes.content
      },
    }),
  })

  // Use just the origin (not full URL) so absolute paths like /docs/foo resolve correctly
  const origin = new URL(url).origin
  let options: HTMLToMarkdownOptions = { origin, ...mdreamOptions }
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
function clientPrefersMarkdown(event: H3Event): boolean {
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

interface ConvertHtmlOptions {
  /** Extract updatedAt from meta tags */
  extractUpdatedAt?: boolean
  /** Call runtime hooks (ai-ready:mdreamConfig, ai-ready:markdown) */
  hooks?: { route: string, event: H3Event }
}

// Convert HTML to Markdown with optional hooks and updatedAt extraction
export async function convertHtmlToMarkdown(
  html: string,
  url: string,
  mdreamOptions: ModulePublicRuntimeConfig['mdreamOptions'],
  opts: ConvertHtmlOptions = {},
) {
  const meta: ExtractedMeta = { title: '', description: '', metaKeywords: '', headings: [], textContent: [] }
  const options = buildMdreamOptions(url, mdreamOptions, meta, opts.extractUpdatedAt)

  let markdown: string
  if (opts.hooks) {
    const nitroApp = useNitroApp()
    await nitroApp.hooks.callHook('ai-ready:mdreamConfig', options)

    const context: MarkdownContext = {
      html,
      markdown: htmlToMarkdown(html, options),
      route: opts.hooks.route,
      title: meta.title,
      description: meta.description,
      isPrerender: false,
      event: opts.hooks.event,
    }
    await nitroApp.hooks.callHook('ai-ready:markdown', context)
    markdown = context.markdown
  }
  else {
    markdown = htmlToMarkdown(html, options)
  }

  return {
    markdown: normalizeWhitespace(markdown),
    title: normalizeWhitespace(meta.title),
    description: normalizeWhitespace(meta.description),
    headings: meta.headings,
    metaKeywords: meta.metaKeywords,
    textContent: meta.textContent.join(' '),
    ...(meta.updatedAt && { updatedAt: meta.updatedAt }),
  }
}
