import type { LlmsTxtConfig, LlmsTxtSection } from './types'
import { formatLlmsTxtPageLink, normalizeLlmsTxtConfig } from './llms-txt-format'

export interface LlmsTxtPage {
  pathname: string
  href?: string
  title?: string
  description?: string
  locale?: string
}

const FILE_PATH = /^\/llms\/[a-z0-9][a-z0-9_-]*\.txt$/i
const SITEMAP_NAME = /^[a-z0-9][\w-]*$/i

export function llmsTxtSectionPath(section: LlmsTxtSection): string {
  const name = Array.isArray(section.sitemap) ? section.sitemap[0] : section.sitemap
  return section.path || `/llms/${name}.txt`
}

export type ParsedLlmsTxtConfig
  = | { _tag: 'Valid', config: LlmsTxtConfig }
    | { _tag: 'Invalid', message: string }

/** Parse the public configuration once, before Nitro registers routes. */
export function parseLlmsTxtConfig(input: unknown): ParsedLlmsTxtConfig {
  const invalid = (message: string): ParsedLlmsTxtConfig => ({ _tag: 'Invalid', message })
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return invalid('llmsTxt must be an object or false.')
  const config = input as LlmsTxtConfig
  if (config.pages !== undefined && config.pages !== false && config.pages !== 'sitemap' && config.pages !== 'all')
    return invalid('llmsTxt.pages must be sitemap, all, or false.')
  if (config.maxLength !== undefined && (!Number.isSafeInteger(config.maxLength) || config.maxLength < 1024))
    return invalid('llmsTxt.maxLength must be an integer of at least 1024.')
  if (config.sitemaps !== undefined && (!Array.isArray(config.sitemaps) || config.sitemaps.some(name => typeof name !== 'string' || !SITEMAP_NAME.test(name))))
    return invalid('llmsTxt.sitemaps must contain sitemap names.')
  if (config.sections !== undefined && !Array.isArray(config.sections))
    return invalid('llmsTxt.sections must be an array.')
  const paths = new Set<string>()
  for (const section of config.sections || []) {
    if (!section || typeof section !== 'object' || typeof section.title !== 'string')
      return invalid('Each llmsTxt section needs a title.')
    if (section.sitemap === undefined) {
      if (section.path !== undefined)
        return invalid('A section path requires a sitemap.')
      continue
    }
    const names = Array.isArray(section.sitemap) ? section.sitemap : [section.sitemap]
    if (!names.length || names.some(name => typeof name !== 'string' || !SITEMAP_NAME.test(name)))
      return invalid('Each section sitemap must contain a sitemap name.')
    const path = llmsTxtSectionPath(section)
    if (!FILE_PATH.test(path))
      return invalid('A section path must use /llms/<name>.txt.')
    if (paths.has(path))
      return invalid(`Duplicate llmsTxt section path: ${path}.`)
    paths.add(path)
  }
  return { _tag: 'Valid', config }
}

interface LlmsTxtFilesInput {
  rootContent?: string
  header: string
  config: LlmsTxtConfig
  sections: LlmsTxtSection[]
  pages: LlmsTxtPage[]
  sitemapPages: ReadonlyMap<string, LlmsTxtPage[]>
  resolveUrl: (path: string) => string
}

/** A bounded tree of file lists. Every page appears once; every file is reachable from the root. */
export function createLlmsTxtFiles(input: LlmsTxtFilesInput): Map<string, string> {
  const files = new Map<string, string>()
  const maxLength = input.config.maxLength ?? 80_000
  const link = (title: string, path: string, description?: string) => formatLlmsTxtPageLink({ pathname: path, href: input.resolveUrl(path), title, description })
  const render = (header: string, title: string, lines: string[]) => `${header.trim()}\n\n## ${title.replace(/\s+/g, ' ').trim()}\n\n${lines.join('\n')}\n`

  function tree(path: string, prefix: string, header: string, title: string, lines: string[], level = 0): void {
    const body = render(header, title, lines)
    if (body.length <= maxLength) {
      files.set(path, body)
      return
    }
    const overhead = render(header, title, []).length
    const chunks: string[][] = []
    let chunk: string[] = []
    let length = overhead
    for (const line of lines) {
      if (overhead + line.length + 1 > maxLength)
        throw new Error('An llms.txt entry exceeds llmsTxt.maxLength. Shorten the entry or increase the limit.')
      if (length + line.length + 1 > maxLength) {
        chunks.push(chunk)
        chunk = []
        length = overhead
      }
      chunk.push(line)
      length += line.length + 1
    }
    if (chunk.length)
      chunks.push(chunk)
    if (chunks.length >= lines.length)
      throw new Error('llmsTxt.maxLength cannot fit an index. Increase the limit.')
    const links = chunks.map((entries, index) => {
      const child = `/llms/_${prefix}-${level}-${index + 1}.txt`
      files.set(child, render(header, title, entries))
      return link(`${title} ${index + 1}`, child)
    })
    tree(path, prefix, header, title, links, level + 1)
  }

  const sections: LlmsTxtSection[] = []
  const assigned = new Set<string>()
  for (const [index, section] of input.sections.entries()) {
    if (!section.sitemap) {
      sections.push(section)
      continue
    }
    const names = Array.isArray(section.sitemap) ? section.sitemap : [section.sitemap]
    const pages = new Map<string, LlmsTxtPage>()
    for (const name of names) {
      for (const page of input.sitemapPages.get(name) || []) {
        // A page in several sitemaps belongs to the first configured section.
        if (!assigned.has(page.pathname))
          pages.set(page.pathname, page)
      }
    }
    const entries = [...(section.links || []).map(entry => formatLlmsTxtPageLink({ pathname: entry.href, ...entry })), ...[...pages.values()].map(formatLlmsTxtPageLink)]
    if (!entries.length)
      continue
    for (const pathname of pages.keys())
      assigned.add(pathname)
    const path = llmsTxtSectionPath(section)
    const description = Array.isArray(section.description) ? section.description.join(' ') : section.description
    const preamble = normalizeLlmsTxtConfig({ notes: description })
    tree(path, `section-${index + 1}`, `${input.header.trim()}\n\n${preamble}\n\n${link('llms.txt', '/llms.txt')}`, section.title, entries)
    sections.push({ ...section, sitemap: undefined, path: undefined, links: [{ title: section.title, href: input.resolveUrl(path), description }] })
  }
  const rootHeader = `${input.header.trim()}\n\n${normalizeLlmsTxtConfig({ ...input.config, sections })}${input.rootContent ? `\n\n${input.rootContent}` : ''}`
  const pages = input.pages.filter(page => !assigned.has(page.pathname)).map(formatLlmsTxtPageLink)
  if (!pages.length && rootHeader.length + 1 <= maxLength) {
    files.set('/llms.txt', `${rootHeader.trim()}\n`)
  }
  else {
    // Child lists carry only the site header, not the root's custom sections.
    const inline = render(rootHeader, 'Pages', pages)
    if (inline.length <= maxLength) {
      files.set('/llms.txt', inline)
    }
    else {
      tree('/llms/_pages.txt', 'pages', input.header, 'Pages', pages)
      const root = `${rootHeader.trim()}\n\n## Pages\n\n${link('Pages', '/llms/_pages.txt')}\n`
      if (root.length > maxLength)
        throw new Error('llms.txt sections exceed llmsTxt.maxLength. Shorten the sections or increase the limit.')
      files.set('/llms.txt', root)
    }
  }
  return files
}
