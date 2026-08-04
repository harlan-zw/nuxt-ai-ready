/**
 * Utilities for formatting llms-full.txt content
 */

import type { LlmsTxtConfig } from '../../types'
import { joinURL } from 'ufo'
import { normalizeLlmsTxtConfig } from '../../llms-txt-format'

const RE_FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n*/
const RE_INLINE_WHITESPACE = /\s+/g

export function formatPageForLlmsFullTxt(
  route: string,
  title: string,
  description: string,
  markdown: string,
  siteUrl?: string,
): string {
  const canonicalUrl = siteUrl ? joinURL(siteUrl, route) : route
  const pageTitle = (title && title !== route ? title : route).trim().replace(RE_INLINE_WHITESPACE, ' ')
  const pageDescription = description.trim().replace(RE_INLINE_WHITESPACE, ' ')
  const content = markdown.replace(RE_FRONTMATTER, '').trim()

  const parts = ['---', '', `- **Page:** ${pageTitle}`, `- **Source:** ${canonicalUrl}`]
  if (pageDescription)
    parts.push(`- **Description:** ${pageDescription}`)
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
  const parts: string[] = [`# ${siteInfo?.name || siteInfo?.url || 'Site'}`]
  if (siteInfo?.description)
    parts.push('', `> ${siteInfo.description}`)
  if (siteInfo?.url)
    parts.push('', `Canonical Origin: ${siteInfo.url}`)

  if (llmsTxtConfig) {
    const normalizedContent = normalizeLlmsTxtConfig(llmsTxtConfig)
    if (normalizedContent)
      parts.push('', normalizedContent)
  }

  return `${parts.join('\n')}\n\n`
}
