// Standalone YAML frontmatter builder for cases where there is no HTML to feed
// through mdream (e.g. the friendly 404 markdown response). For HTML-derived
// pages, prefer mdream's `additionalFields` so the engine owns emission.

import { isMap, parseDocument } from 'yaml'

interface FrontmatterAlternate {
  hreflang: string
  href: string
}

interface FrontmatterFields {
  title?: string
  description?: string
  canonical_url?: string
  last_updated?: string
  locale?: string
  alternates?: FrontmatterAlternate[]
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function buildFrontmatter(fields: FrontmatterFields): string {
  const lines: string[] = ['---']
  if (fields.title)
    lines.push(`title: "${escapeYamlString(fields.title)}"`)
  if (fields.description)
    lines.push(`description: "${escapeYamlString(fields.description)}"`)
  if (fields.canonical_url)
    lines.push(`canonical_url: "${escapeYamlString(fields.canonical_url)}"`)
  if (fields.last_updated)
    lines.push(`last_updated: "${escapeYamlString(fields.last_updated)}"`)
  if (fields.locale)
    lines.push(`locale: "${escapeYamlString(fields.locale)}"`)
  if (fields.alternates?.length) {
    lines.push('alternates:')
    for (const alt of fields.alternates)
      lines.push(`  - { hreflang: "${escapeYamlString(alt.hreflang)}", href: "${escapeYamlString(alt.href)}" }`)
  }
  lines.push('---', '')
  return lines.join('\n')
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export function layerFrontmatter(fields: FrontmatterFields, markdown: string): string {
  const match = markdown.match(FRONTMATTER_RE)
  if (!match)
    return `${buildFrontmatter(fields)}\n${markdown}`

  const document = parseDocument(match[1]!)
  if (document.errors.length || !isMap(document.contents))
    return `${buildFrontmatter(fields)}\n${markdown}`

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '')
      document.set(key, value)
  }

  const body = markdown.slice(match[0].length).replace(/^\r?\n/, '')
  return `---\n${document.toString({ lineWidth: 0 }).trimEnd()}\n---\n\n${body}`
}
