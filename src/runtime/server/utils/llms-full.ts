/**
 * Utilities for formatting llms-full.txt content
 */

import type { LlmsTxtConfig } from '../../types'
import { joinURL } from 'ufo'
import { isMap, isScalar, parseDocument, stringify } from 'yaml'
import { normalizeLlmsTxtConfig } from '../../llms-txt-format'
import { escapeMarkdownHtml } from '../../markdown-text'

const RE_FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n*/
const RE_INLINE_WHITESPACE = /\s+/g

function imageMetadataFence(frontmatter: string): string | undefined {
  const document = parseDocument(frontmatter)
  const meta = document.get('meta', true)
  if (document.errors.length || !isMap(meta))
    return

  const images: Record<string, string | number> = {}
  for (const { key, value } of meta.items) {
    if (!isScalar(key) || typeof key.value !== 'string' || !isScalar(value))
      continue
    if (key.value !== 'og:image' && !key.value.startsWith('og:image:') && key.value !== 'twitter:image' && !key.value.startsWith('twitter:image:'))
      continue
    if (typeof value.value === 'string' || (typeof value.value === 'number' && Number.isFinite(value.value)))
      images[key.value] = value.value
  }
  if (!Object.keys(images).length)
    return

  return `\`\`\`yaml\n${stringify({ meta: images }, { lineWidth: 0 }).trimEnd()}\n\`\`\``
}

export function formatPageForLlmsFullTxt(
  route: string,
  title: string,
  description: string,
  markdown: string,
  siteUrl?: string,
): string {
  const canonicalUrl = siteUrl ? joinURL(siteUrl, route) : route
  const pageTitle = escapeMarkdownHtml((title && title !== route ? title : route).trim().replace(RE_INLINE_WHITESPACE, ' '))
  const pageDescription = escapeMarkdownHtml(description.trim().replace(RE_INLINE_WHITESPACE, ' '))
  const content = markdown.replace(RE_FRONTMATTER, '').trim()

  const parts = ['---', '', `- **Page:** ${pageTitle}`, `- **Source:** ${canonicalUrl}`]
  if (pageDescription)
    parts.push(`- **Description:** ${pageDescription}`)
  const frontmatter = markdown.match(RE_FRONTMATTER)?.[1]
  const images = frontmatter && imageMetadataFence(frontmatter)
  if (images)
    parts.push('', images)
  parts.push('')
  if (content) {
    parts.push(content)
    parts.push('')
  }

  return `${parts.join('\n')}\n`
}

export interface SiteInfo {
  name?: string
  url?: string
  description?: string
}

export function buildLlmsFullTxtHeader(siteInfo?: SiteInfo, llmsTxtConfig?: LlmsTxtConfig): string {
  const parts: string[] = [`# ${escapeMarkdownHtml(siteInfo?.name || siteInfo?.url || 'Site')}`]
  if (siteInfo?.description)
    parts.push('', `> ${escapeMarkdownHtml(siteInfo.description)}`)
  if (siteInfo?.url)
    parts.push('', `Canonical Origin: ${siteInfo.url}`)

  if (llmsTxtConfig) {
    const normalizedContent = normalizeLlmsTxtConfig(llmsTxtConfig)
    if (normalizedContent)
      parts.push('', normalizedContent)
  }

  return `${parts.join('\n')}\n\n`
}
