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

function normalizeSection(section: LlmsTxtSection, headingLevel: number = 2): string {
  const prefix = '#'.repeat(headingLevel)
  const parts: string[] = []
  parts.push(`${prefix} ${section.title}`)
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
  const required = config.sections?.filter(s => !s.optional) ?? []
  const optional = config.sections?.filter(s => s.optional) ?? []
  if (required.length)
    parts.push(...required.map(s => normalizeSection(s)))
  if (optional.length) {
    parts.push('## Optional')
    parts.push(...optional.map(s => normalizeSection(s, 3)))
  }
  if (config.notes) {
    parts.push('## Notes')
    parts.push('')
    const notes = Array.isArray(config.notes) ? config.notes : [config.notes]
    parts.push(...notes)
  }
  return parts.join('\n\n')
}
