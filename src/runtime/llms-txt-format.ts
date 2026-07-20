/**
 * Pure formatting functions for llms.txt - no runtime dependencies
 */

import type { RuntimeI18nConfig } from './server/utils/i18n'
import type { LlmsTxtConfig, LlmsTxtLink, LlmsTxtSection } from './types'
import { localePath } from './server/utils/i18n'

const RE_INLINE_WHITESPACE = /\s+/g

function normalizeInlineText(value: string): string {
  return value.trim().replace(RE_INLINE_WHITESPACE, ' ')
}

function normalizeLink(link: LlmsTxtLink, descriptionPrefix?: string): string {
  const descriptions = [descriptionPrefix, link.description]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeInlineText)
  const description = descriptions.join(' — ')
  return `- [${normalizeInlineText(link.title)}](${link.href.trim()})${description ? `: ${description}` : ''}`
}

function normalizeSection(section: LlmsTxtSection): string {
  const parts: string[] = [`## ${normalizeInlineText(section.title)}`]
  if (section.links?.length)
    parts.push('', ...section.links.map(link => normalizeLink(link)))
  return parts.join('\n')
}

function normalizePreamble(config: LlmsTxtConfig): string[] {
  const parts: string[] = []

  if (config.notes) {
    const notes = (Array.isArray(config.notes) ? config.notes : [config.notes]).filter(note => note.trim())
    if (notes.length)
      parts.push(['**Notes:**', ...notes].join('\n\n'))
  }

  for (const section of config.sections ?? []) {
    if (!section.description)
      continue
    const descriptions = (Array.isArray(section.description) ? section.description : [section.description])
      .filter(description => description.trim())
    if (descriptions.length)
      parts.push([`**${normalizeInlineText(section.title)}:**`, ...descriptions].join('\n\n'))
  }

  return parts
}

function normalizeOptionalSections(sections: LlmsTxtSection[]): string | undefined {
  const links = sections.flatMap(section =>
    section.links?.map(link => normalizeLink(link, section.title)) ?? [],
  )
  if (!links.length)
    return undefined
  return ['## Optional', '', ...links].join('\n')
}

function normalizeRequiredSections(sections: LlmsTxtSection[]): string[] {
  return sections
    .filter(section => section.links?.length)
    .map(normalizeSection)
}

export function formatAvailableLanguagesSection(
  i18n: RuntimeI18nConfig,
  pageCounts: Map<string, number>,
  resolveHref: (pathname: string) => string = pathname => pathname,
): string[] {
  const lines: string[] = ['## Available Languages on Website', '']
  for (const locale of i18n.locales) {
    const isDefault = locale.code === i18n.defaultLocale
    const prefix = localePath('/', locale.code, i18n)
    const count = pageCounts.get(locale.code) ?? 0
    const display = locale.nativeName
      ? `${locale.nativeName} (${locale.code})`
      : locale.name
        ? `${locale.name} (${locale.code})`
        : locale.code
    const suffix = isDefault ? 'content included below' : 'visit this language for content'
    lines.push(`- [${display}](${resolveHref(prefix)}): ${count} pages; ${suffix}.`)
  }
  return lines
}

interface LlmsTxtPageLink {
  pathname: string
  href?: string
  title?: string
  description?: string
}

export function formatLlmsTxtPageLink(page: LlmsTxtPageLink): string {
  const description = page.description?.trim().replace(RE_INLINE_WHITESPACE, ' ')
  const descText = description ? `: ${description.substring(0, 160)}${description.length > 160 ? '...' : ''}` : ''
  const normalizedTitle = page.title ? normalizeInlineText(page.title) : ''
  const title = normalizedTitle && normalizedTitle !== page.pathname ? normalizedTitle : page.pathname
  const href = (page.href || page.pathname).trim()
  return `- [${title}](${href})${descText}`
}

/**
 * Normalize llms.txt structured configuration to the llmstxt.org Markdown format.
 * Preamble prose must appear before the first H2; every H2 body is a file list.
 */
export function normalizeLlmsTxtConfig(config: LlmsTxtConfig): string {
  const required = config.sections?.filter(section => !section.optional) ?? []
  const optional = config.sections?.filter(section => section.optional) ?? []
  const parts = [
    ...normalizePreamble(config),
    ...normalizeRequiredSections(required),
  ]
  const optionalSection = normalizeOptionalSections(optional)
  if (optionalSection)
    parts.push(optionalSection)
  return parts.join('\n\n')
}
