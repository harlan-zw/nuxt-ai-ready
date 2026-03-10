/**
 * Utilities for formatting llms-full.txt content
 */

import type { LlmsTxtConfig } from '../../types'
import { normalizeLlmsTxtConfig } from '../../llms-txt-format'

const RE_TRAILING_SLASH = /\/$/
const RE_FRONTMATTER = /^---\n[\s\S]*?\n---\n*/
const RE_HEADING = /^(#{1,6}) ([^\n]+)$/gm

export function formatPageForLlmsFullTxt(
  route: string,
  title: string,
  description: string,
  markdown: string,
  siteUrl?: string,
): string {
  const canonicalUrl = siteUrl ? `${siteUrl.replace(RE_TRAILING_SLASH, '')}${route}` : route
  const heading = title && title !== route ? `### ${title}` : `### ${route}`

  // Strip frontmatter and normalize headings (h1 → h1., etc)

  const content = markdown
    .replace(RE_FRONTMATTER, '')
    .replace(RE_HEADING, (_, hashes, text) => `h${(hashes as string).length}. ${text}`)

  const parts = [heading, '']
  parts.push(`Source: ${canonicalUrl}`)
  if (description)
    parts.push(`Description: ${description}`)
  parts.push('')
  if (content.trim()) {
    parts.push(content.trim())
    parts.push('')
  }
  parts.push('---')
  parts.push('')

  return `${parts.join('\n')}\n`
}

export interface SiteInfo {
  name?: string
  url?: string
  description?: string
}

export function buildLlmsFullTxtHeader(siteInfo?: SiteInfo, llmsTxtConfig?: LlmsTxtConfig): string {
  const parts: string[] = []

  parts.push(`# ${siteInfo?.name || siteInfo?.url || 'Site'}`)
  if (siteInfo?.description)
    parts.push(`\n> ${siteInfo.description}`)
  if (siteInfo?.url)
    parts.push(`\nCanonical Origin: ${siteInfo.url}`)
  parts.push('')

  if (llmsTxtConfig) {
    const normalizedContent = normalizeLlmsTxtConfig(llmsTxtConfig)
    if (normalizedContent) {
      parts.push(normalizedContent)
      parts.push('')
    }
  }

  parts.push('## Pages\n\n')
  return parts.join('\n')
}
