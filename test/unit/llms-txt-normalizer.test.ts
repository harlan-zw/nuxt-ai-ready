import type { LlmsTxtConfig, LlmsTxtLink, LlmsTxtSection } from '../../src/runtime/types'
import { describe, expect, it } from 'vitest'

const RE_MD_SECTIONS = /## Section 1\n\n\n## Section 2/

// Inline normalize functions to avoid Nuxt runtime deps
function normalizeLink(link: LlmsTxtLink): string {
  const parts: string[] = []
  parts.push(`- [${link.title}](${link.href})`)
  if (link.description) {
    parts.push(`  ${link.description}`)
  }
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
  if (section.links?.length) {
    parts.push(...section.links.map(normalizeLink))
  }
  return parts.join('\n')
}

function normalizeLlmsTxtConfig(config: LlmsTxtConfig): string {
  const parts: string[] = []
  const required = config.sections?.filter(s => !s.optional) ?? []
  const optional = config.sections?.filter(s => s.optional) ?? []
  if (required.length) {
    parts.push(...required.map(s => normalizeSection(s)))
  }
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

describe('llms.txt normalizer', () => {
  describe('normalizeLink', () => {
    it('should normalize link with title and href', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Test',
          links: [{
            title: 'Home',
            href: '/',
          }],
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('- [Home](/)')
    })

    it('should normalize link with description', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Test',
          links: [{
            title: 'API Docs',
            description: 'Complete API reference',
            href: '/api',
          }],
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('- [API Docs](/api)')
      expect(result).toContain('  Complete API reference')
    })

    it('should normalize multiple links', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Documentation',
          links: [
            { title: 'Getting Started', href: '/docs/start' },
            { title: 'API Reference', href: '/docs/api' },
          ],
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('- [Getting Started](/docs/start)')
      expect(result).toContain('- [API Reference](/docs/api)')
    })
  })

  describe('normalizeSection', () => {
    it('should normalize section with title only', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Simple Section',
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Simple Section')
    })

    it('should normalize section with string description', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Documentation',
          description: 'Complete guides and references',
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Documentation')
      expect(result).toContain('Complete guides and references')
    })

    it('should normalize section with array description (multiple paragraphs)', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Examples',
          description: [
            'Check out these examples:',
            'Multiple paragraphs supported!',
          ],
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Examples')
      expect(result).toContain('Check out these examples:')
      expect(result).toContain('Multiple paragraphs supported!')
    })

    it('should normalize section with description and links', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Resources',
          description: 'Helpful links',
          links: [
            { title: 'Guide', href: '/guide' },
          ],
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Resources')
      expect(result).toContain('Helpful links')
      expect(result).toContain('- [Guide](/guide)')
    })
  })

  describe('normalizeLlmsTxtConfig', () => {
    it('should handle empty config', () => {
      const config: LlmsTxtConfig = {}
      const result = normalizeLlmsTxtConfig(config)
      expect(result).toBe('')
    })

    it('should handle config with empty sections array', () => {
      const config: LlmsTxtConfig = {
        sections: [],
      }
      const result = normalizeLlmsTxtConfig(config)
      expect(result).toBe('')
    })

    it('should normalize multiple sections', () => {
      const config: LlmsTxtConfig = {
        sections: [
          {
            title: 'First Section',
            description: 'First description',
          },
          {
            title: 'Second Section',
            description: 'Second description',
          },
        ],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## First Section')
      expect(result).toContain('First description')
      expect(result).toContain('## Second Section')
      expect(result).toContain('Second description')
    })

    it('should add notes section at the end', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Content',
        }],
        notes: 'This is auto-generated',
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Content')
      expect(result).toContain('## Notes')
      expect(result).toContain('This is auto-generated')
      // Notes should come after content
      expect(result.indexOf('## Notes')).toBeGreaterThan(result.indexOf('## Content'))
    })

    it('should handle notes as array', () => {
      const config: LlmsTxtConfig = {
        notes: [
          'First note',
          'Second note',
        ],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Notes')
      expect(result).toContain('First note')
      expect(result).toContain('Second note')
    })

    it('should handle notes without sections', () => {
      const config: LlmsTxtConfig = {
        notes: 'Just a note',
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Notes')
      expect(result).toContain('Just a note')
    })

    it('should normalize complex config', () => {
      const config: LlmsTxtConfig = {
        sections: [
          {
            title: 'API Endpoints',
            description: 'Available API endpoints',
            links: [
              {
                title: 'Bulk Data',
                description: 'JSONL export',
                href: '/_ai-ready/bulk',
              },
              {
                title: 'MCP Server',
                href: '/mcp',
              },
            ],
          },
          {
            title: 'Documentation',
            description: [
              'Complete documentation:',
              'Guides, API reference, and examples',
            ],
            links: [
              { title: 'Getting Started', href: '/docs/start' },
            ],
          },
        ],
        notes: [
          'Auto-generated during build',
          'For more info visit our GitHub',
        ],
      }

      const result = normalizeLlmsTxtConfig(config)

      // Check sections
      expect(result).toContain('## API Endpoints')
      expect(result).toContain('Available API endpoints')
      expect(result).toContain('- [Bulk Data](/_ai-ready/bulk)')
      expect(result).toContain('  JSONL export')
      expect(result).toContain('- [MCP Server](/mcp)')

      expect(result).toContain('## Documentation')
      expect(result).toContain('Complete documentation:')
      expect(result).toContain('Guides, API reference, and examples')
      expect(result).toContain('- [Getting Started](/docs/start)')

      // Check notes
      expect(result).toContain('## Notes')
      expect(result).toContain('Auto-generated during build')
      expect(result).toContain('For more info visit our GitHub')

      // Notes should be at the end
      const notesIndex = result.indexOf('## Notes')
      expect(notesIndex).toBeGreaterThan(result.indexOf('## API Endpoints'))
      expect(notesIndex).toBeGreaterThan(result.indexOf('## Documentation'))
    })

    it('should handle markdown in descriptions', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Code Example',
          description: '```bash\ncurl /api\n```',
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Code Example')
      expect(result).toContain('```bash')
      expect(result).toContain('curl /api')
      expect(result).toContain('```')
    })

    it('should preserve empty lines between sections', () => {
      const config: LlmsTxtConfig = {
        sections: [
          { title: 'Section 1' },
          { title: 'Section 2' },
        ],
      }

      const result = normalizeLlmsTxtConfig(config)
      // Sections should be separated
      expect(result).toMatch(RE_MD_SECTIONS)
    })

    it('should handle sections with only links (no description)', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Quick Links',
          links: [
            { title: 'Home', href: '/' },
            { title: 'About', href: '/about' },
          ],
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Quick Links')
      expect(result).toContain('- [Home](/)')
      expect(result).toContain('- [About](/about)')
    })

    it('should handle empty links array', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Empty Links Section',
          links: [],
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Empty Links Section')
    })
  })

  describe('optional sections', () => {
    it('should render optional section under ## Optional heading', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Debug Endpoints',
          optional: true,
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Optional')
      expect(result).toContain('### Debug Endpoints')
    })

    it('should use h3 for optional sections instead of h2', () => {
      const config: LlmsTxtConfig = {
        sections: [{
          title: 'Debug Endpoints',
          description: 'Internal debugging information',
          optional: true,
          links: [
            { title: 'Debug Route', href: '/__ai-ready-debug' },
          ],
        }],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('### Debug Endpoints')
      expect(result).not.toMatch(/^## Debug Endpoints$/m)
      expect(result).toContain('Internal debugging information')
      expect(result).toContain('- [Debug Route](/__ai-ready-debug)')
    })

    it('should render required sections first, then optional', () => {
      const config: LlmsTxtConfig = {
        sections: [
          { title: 'API Reference', description: 'Main API docs' },
          { title: 'Debug Endpoints', optional: true },
          { title: 'Getting Started', description: 'Quick start guide' },
        ],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## API Reference')
      expect(result).toContain('## Getting Started')
      expect(result).toContain('## Optional')
      expect(result).toContain('### Debug Endpoints')
      expect(result.indexOf('## API Reference')).toBeLessThan(result.indexOf('## Optional'))
      expect(result.indexOf('## Getting Started')).toBeLessThan(result.indexOf('## Optional'))
    })

    it('should group multiple optional sections under single ## Optional', () => {
      const config: LlmsTxtConfig = {
        sections: [
          { title: 'Debug Endpoints', optional: true },
          { title: 'Legacy API', optional: true, description: 'Old API endpoints still available.' },
        ],
      }

      const result = normalizeLlmsTxtConfig(config)
      const optionalCount = result.split('## Optional').length - 1
      expect(optionalCount).toBe(1)
      expect(result).toContain('### Debug Endpoints')
      expect(result).toContain('### Legacy API')
      expect(result).toContain('Old API endpoints still available.')
    })

    it('should show ## Optional heading when all sections are optional', () => {
      const config: LlmsTxtConfig = {
        sections: [
          { title: 'First', optional: true },
          { title: 'Second', optional: true },
        ],
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result).toContain('## Optional')
      expect(result).toContain('### First')
      expect(result).toContain('### Second')
      expect(result).not.toMatch(/^## First$/m)
      expect(result).not.toMatch(/^## Second$/m)
    })

    it('should render optional sections before notes', () => {
      const config: LlmsTxtConfig = {
        sections: [
          { title: 'Content' },
          { title: 'Debug', optional: true },
        ],
        notes: 'Auto-generated',
      }

      const result = normalizeLlmsTxtConfig(config)
      expect(result.indexOf('## Optional')).toBeLessThan(result.indexOf('## Notes'))
      expect(result.indexOf('### Debug')).toBeLessThan(result.indexOf('## Notes'))
    })
  })
})
