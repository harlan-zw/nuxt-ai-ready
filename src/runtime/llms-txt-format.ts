/**
 * Pure formatting functions for llms.txt - no runtime dependencies
 */

import type { LlmsTxtConfig, LlmsTxtLink, LlmsTxtSection } from './types'

function normalizeLink(link: LlmsTxtLink): string {
  const parts: string[] = []
  parts.push(`- [${link.title}](${link.href})`)
  if (link.description)
    parts.push(`  ${link.description}`)
  return parts.join('\n')
}

function normalizeSection(section: LlmsTxtSection): string {
  const parts: string[] = []
  parts.push(`## ${section.title}`)
  parts.push('')
  if (section.description) {
    const descriptions = Array.isArray(section.description)
      ? section.description
      : [section.description]
    parts.push(...descriptions)
    parts.push('')
  }
  if (section.links?.length)
    parts.push(...section.links.map(normalizeLink))
  return parts.join('\n')
}

/**
 * Normalize llms.txt structured configuration to markdown string
 */
export function normalizeLlmsTxtConfig(config: LlmsTxtConfig): string {
  const parts: string[] = []
  if (config.sections?.length)
    parts.push(...config.sections.map(normalizeSection))
  if (config.notes) {
    parts.push('## Notes')
    parts.push('')
    const notes = Array.isArray(config.notes) ? config.notes : [config.notes]
    parts.push(...notes)
  }
  return parts.join('\n\n')
}
