import type { LlmsTxtConfig } from '../../src/runtime/types'
import { describe, expect, it } from 'vitest'
import { normalizeLlmsTxtConfig } from '../../src/utils'

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
      expect(result).toMatch(/## Section 1\n\n\n## Section 2/)
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
})
