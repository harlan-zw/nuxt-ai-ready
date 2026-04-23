// YAML frontmatter generation for markdown responses.
// Format follows Vercel agent-readability spec: title, description, canonical_url, last_updated.

interface FrontmatterFields {
  title?: string
  description?: string
  canonical_url?: string
  last_updated?: string
}

const RE_FRONTMATTER_LEADING = /^---\n[\s\S]*?\n---\n*/

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
  lines.push('---', '')
  return lines.join('\n')
}

export function stripLeadingFrontmatter(markdown: string): string {
  return markdown.replace(RE_FRONTMATTER_LEADING, '')
}

export function withFrontmatter(markdown: string, fields: FrontmatterFields): string {
  const stripped = stripLeadingFrontmatter(markdown)
  return `${buildFrontmatter(fields)}\n${stripped.replace(/^\n+/, '')}`
}
