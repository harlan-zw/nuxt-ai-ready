import type { LlmsTxtConfig } from '../../src/runtime/types'
import type { RuntimeI18nConfig } from '../../src/utils/i18n'
import { describe, expect, it } from 'vitest'
import { formatLlmsTxtPageLink, normalizeLlmsTxtConfig } from '../../src/runtime/llms-txt-format'
import { formatAvailableLanguagesSection } from '../../src/runtime/llms-txt-i18n'

const RE_H2 = /^## (.+)$/
const RE_LINK = /^- \[([^\]]+)\]\(([^)]+)\)(?:: (.*))?$/

interface ParsedLink {
  title: string
  url: string
  description?: string
}

/** Mirrors the line-oriented assumptions of the llmstxt.org reference parser. */
function parseFileSections(markdown: string): Record<string, ParsedLink[]> {
  const sections: Record<string, ParsedLink[]> = {}
  let currentSection: string | undefined

  for (const line of markdown.split('\n')) {
    const heading = RE_H2.exec(line)
    if (heading) {
      const sectionName = heading[1]!
      currentSection = sectionName
      sections[sectionName] = []
      continue
    }
    if (!currentSection || !line.trim())
      continue

    const link = RE_LINK.exec(line)
    if (!link)
      throw new Error(`Invalid file-list entry in ${currentSection}: ${line}`)
    sections[currentSection]!.push({
      title: link[1]!,
      url: link[2]!,
      ...(link[3] && { description: link[3] }),
    })
  }

  return sections
}

describe('normalizeLlmsTxtConfig', () => {
  it('formats link descriptions on the same line', () => {
    const result = normalizeLlmsTxtConfig({
      sections: [{
        title: 'Documentation',
        links: [
          { title: 'Getting Started', href: '/start.md' },
          { title: 'API\nReference', href: ' /api.md ', description: 'Complete\n API reference' },
        ],
      }],
    })

    expect(result).toContain('- [Getting Started](/start.md)')
    expect(result).toContain('- [API Reference](/api.md): Complete API reference')
    expect(result).not.toContain('\n  Complete')
  })

  it('moves notes and section descriptions into the preamble', () => {
    const result = normalizeLlmsTxtConfig({
      notes: ['Generated automatically.', 'Prefer the stable API.'],
      sections: [{
        title: 'API Reference',
        description: ['Reference documentation.', 'Examples use TypeScript.'],
        links: [{ title: 'REST API', href: '/api.md' }],
      }],
    })

    const headingIndex = result.indexOf('## API Reference')
    expect(result.indexOf('**Notes:**')).toBeLessThan(headingIndex)
    expect(result.indexOf('Generated automatically.')).toBeLessThan(headingIndex)
    expect(result.indexOf('**API Reference:**')).toBeLessThan(headingIndex)
    expect(result.indexOf('Examples use TypeScript.')).toBeLessThan(headingIndex)
    expect(result).not.toContain('## Notes')
  })

  it('escapes headings embedded in preamble content', () => {
    const result = normalizeLlmsTxtConfig({
      notes: '## Important\nRead this first.',
      sections: [{
        title: 'Documentation',
        description: '# Overview\nPrimary resources.',
        links: [{ title: 'Guide', href: '/guide.md' }],
      }],
    })

    expect(result).toContain('\\## Important')
    expect(result).toContain('\\# Overview')
    expect(result).not.toMatch(/^## Important$/m)
    expect(() => parseFileSections(result)).not.toThrow()
  })

  it('preserves Markdown preamble content outside file-list sections', () => {
    const result = normalizeLlmsTxtConfig({
      sections: [{
        title: 'Examples',
        description: '```bash\ncurl /api\n```',
        links: [{ title: 'Example', href: '/example.md' }],
      }],
    })

    expect(result).toMatch(/^\*\*Examples:\*\*[\s\S]*```bash[\s\S]*## Examples/)
  })

  it('flattens optional sections under the single special heading', () => {
    const result = normalizeLlmsTxtConfig({
      sections: [
        {
          title: 'Debug Endpoints',
          optional: true,
          links: [{ title: 'Debug Route', href: '/debug.md', description: 'Internal diagnostics' }],
        },
        {
          title: 'Legacy API',
          optional: true,
          links: [{ title: 'Version 1', href: '/v1.md' }],
        },
      ],
    })

    expect(result.match(/^## Optional$/gm)).toHaveLength(1)
    expect(result).not.toMatch(/^### /m)
    expect(result).toContain('- [Debug Route](/debug.md): Debug Endpoints; Internal diagnostics')
    expect(result).toContain('- [Version 1](/v1.md): Legacy API')
  })

  it('keeps optional section descriptions inside the optional file list', () => {
    const result = normalizeLlmsTxtConfig({
      sections: [{
        title: 'Debug Endpoints',
        description: ['Internal debugging tools.', 'May expose implementation details.'],
        optional: true,
        links: [{ title: 'Debug Route', href: '/debug.md', description: 'Runtime diagnostics' }],
      }],
    })

    const optionalIndex = result.indexOf('## Optional')
    expect(result.indexOf('Internal debugging tools.')).toBeGreaterThan(optionalIndex)
    expect(result).toContain('- [Debug Route](/debug.md): Debug Endpoints; Internal debugging tools.; May expose implementation details.; Runtime diagnostics')
  })

  it('emits parser-safe Markdown links for reserved title and URL characters', () => {
    const result = normalizeLlmsTxtConfig({
      sections: [{
        title: 'Documentation',
        links: [{
          title: 'Array[T]',
          href: '/guides/(typed arrays).md',
        }],
      }],
    })

    expect(result).toContain('- [Array&#91;T&#93;](/guides/%28typed%20arrays%29.md)')
    expect(() => parseFileSections(result)).not.toThrow()
  })

  it('omits an empty optional file-list section', () => {
    const result = normalizeLlmsTxtConfig({
      sections: [{ title: 'Empty', optional: true }],
    })

    expect(result).toBe('')
  })

  it('keeps a description-only required section in the preamble without emitting an empty H2', () => {
    const result = normalizeLlmsTxtConfig({
      sections: [{ title: 'Context', description: 'Read this first.' }],
    })

    expect(result).toBe('**Context:**\n\nRead this first.')
    expect(result).not.toContain('## Context')
  })

  it('produces sections accepted by the reference-parser shape', () => {
    const config: LlmsTxtConfig = {
      notes: 'Use the stable documentation.',
      sections: [
        {
          title: 'Docs',
          description: 'Primary resources.',
          links: [
            { title: 'Guide', href: '/guide.md', description: 'Start here' },
            { title: 'API', href: '/api.md' },
          ],
        },
        {
          title: 'Examples',
          optional: true,
          links: [{ title: 'Demo', href: '/demo.md', description: 'Runnable project' }],
        },
      ],
    }

    const sections = parseFileSections(normalizeLlmsTxtConfig(config))
    expect(sections).toEqual({
      Docs: [
        { title: 'Guide', url: '/guide.md', description: 'Start here' },
        { title: 'API', url: '/api.md' },
      ],
      Optional: [
        { title: 'Demo', url: '/demo.md', description: 'Examples; Runnable project' },
      ],
    })
  })

  it('handles an empty configuration', () => {
    expect(normalizeLlmsTxtConfig({})).toBe('')
  })
})

describe('llms.txt generated file-list entries', () => {
  it('formats locale roots as links', () => {
    const i18n: RuntimeI18nConfig = {
      defaultLocale: 'en',
      strategy: 'prefix_except_default',
      locales: [
        { code: 'en', hreflang: 'en', name: 'English' },
        { code: 'fr', hreflang: 'fr-FR', nativeName: 'Français' },
        { code: 'ja', hreflang: 'ja-JP' },
      ],
    }

    expect(formatAvailableLanguagesSection(
      i18n,
      new Map([
        ['en', 2],
        ['fr', 3],
      ]),
      pathname => pathname === '/' ? '/docs/' : `/docs${pathname}`,
    )).toEqual([
      '## Available Languages on Website',
      '',
      '- [English (en)](/docs/): 2 pages; content included below.',
      '- [Français (fr)](/docs/fr): 3 pages; visit this language for content.',
      '- [ja](/docs/ja): 0 pages; visit this language for content.',
    ])
  })

  it('formats locale roots on their configured domains', () => {
    const i18n: RuntimeI18nConfig = {
      defaultLocale: 'en',
      strategy: 'prefix_and_default',
      differentDomains: true,
      locales: [
        { code: 'en', hreflang: 'en', domain: 'en.example.com' },
        { code: 'fr', hreflang: 'fr-FR', domain: 'fr.example.com' },
      ],
    }

    expect(formatAvailableLanguagesSection(
      i18n,
      new Map([['en', 2], ['fr', 3]]),
      pathname => pathname,
      { host: 'en.example.com' },
    )).toEqual([
      '## Available Languages on Website',
      '',
      '- [en](https://en.example.com/): 2 pages; content included below.',
      '- [fr](https://fr.example.com/): 3 pages; visit this language for content.',
    ])
  })

  it('normalizes multiline page descriptions onto one file-list line', () => {
    expect(formatLlmsTxtPageLink({
      pathname: '/guide/',
      href: ' /guide/ ',
      title: 'Guide\n Page',
      description: ' First line\n  second line ',
    })).toBe('- [Guide Page](/guide/): First line second line')
  })

  it('always links page paths, even when metadata has no title', () => {
    expect(formatLlmsTxtPageLink({
      pathname: '/legacy/',
    })).toBe('- [/legacy/](/legacy/)')
  })

  it('truncates normalized page descriptions to 160 characters', () => {
    const description = `Start\n${'x'.repeat(170)}`

    const result = formatLlmsTxtPageLink({ pathname: '/long', description })

    expect(result).toBe(`- [/long](/long): ${`Start ${'x'.repeat(170)}`.substring(0, 160)}...`)
  })
})
