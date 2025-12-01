import type { LlmsTxtConfig, LlmsTxtLink, LlmsTxtSection } from './runtime/types'

/**
 * Normalize a link to markdown format
 */
function normalizeLink(link: LlmsTxtLink): string {
  const parts: string[] = []
  parts.push(`- [${link.title}](${link.href})`)
  if (link.description) {
    parts.push(`  ${link.description}`)
  }
  return parts.join('\n')
}

/**
 * Normalize a section to markdown format
 */
function normalizeSection(section: LlmsTxtSection): string {
  const parts: string[] = []

  // Add title
  parts.push(`## ${section.title}`)
  parts.push('')

  // Add description (support both string and array of paragraphs)
  if (section.description) {
    const descriptions = Array.isArray(section.description)
      ? section.description
      : [section.description]
    parts.push(...descriptions)
    parts.push('')
  }

  // Add links
  if (section.links?.length) {
    parts.push(...section.links.map(normalizeLink))
  }

  return parts.join('\n')
}

/**
 * Normalize llms.txt structured configuration to markdown string
 */
export function normalizeLlmsTxtConfig(config: LlmsTxtConfig): string {
  const parts: string[] = []

  // Add sections
  if (config.sections?.length) {
    parts.push(...config.sections.map(normalizeSection))
  }

  // Add notes section (always at the end)
  if (config.notes) {
    parts.push('## Notes')
    parts.push('')
    const notes = Array.isArray(config.notes) ? config.notes : [config.notes]
    parts.push(...notes)
  }

  return parts.join('\n\n')
}
