import { describe, expect, it } from 'vitest'
import { buildLlmsFullTxtHeader, formatPageForLlmsFullTxt } from '../../src/runtime/server/utils/llms-full'

describe('llms-full.txt formatter', () => {
  it('preserves source heading levels and fenced code', () => {
    const markdown = `---
title: Example
---

# Page title

## Section

### Third level

#### Fourth level

##### Fifth level

###### Sixth level

\`\`\`md
# This is code, not a heading
\`\`\`

Setext heading
--------------`

    const result = formatPageForLlmsFullTxt(
      '/example',
      'Example page',
      'An example page.',
      markdown,
      'https://example.com/',
    )

    expect(result).toBe(`---

- **Page:** Example page
- **Source:** https://example.com/example
- **Description:** An example page.

# Page title

## Section

### Third level

#### Fourth level

##### Fifth level

###### Sixth level

\`\`\`md
# This is code, not a heading
\`\`\`

Setext heading
--------------

`)
    expect(result).not.toContain('h1.')
    expect(result).not.toContain('h2.')
  })

  it('supports CRLF frontmatter and missing optional metadata', () => {
    const result = formatPageForLlmsFullTxt(
      '/untitled',
      '/untitled',
      '',
      '---\r\ntitle: Untitled\r\n---\r\n# Content',
    )

    expect(result).toContain('- **Page:** /untitled')
    expect(result).toContain('- **Source:** /untitled')
    expect(result).not.toContain('**Description:**')
    expect(result).toContain('\n# Content\n')
    expect(result).not.toContain('title: Untitled')
  })

  it('normalizes multiline metadata without changing page content', () => {
    const result = formatPageForLlmsFullTxt('/page', 'Page\n title', 'First line\n second line', '# Exact\n\nBody')

    expect(result).toContain('- **Page:** Page title')
    expect(result).toContain('- **Description:** First line second line')
    expect(result).toContain('# Exact\n\nBody')
  })

  it('builds a header without a synthetic Pages hierarchy', () => {
    const result = buildLlmsFullTxtHeader(
      { name: 'Example', url: 'https://example.com', description: 'Example site.' },
      {
        sections: [{
          title: 'Resources',
          links: [{ title: 'Index', href: '/llms.txt', description: 'Site index' }],
        }],
      },
    )

    expect(result).toBe(`# Example

> Example site.

Canonical Origin: https://example.com

## Resources

- [Index](/llms.txt): Site index

`)
    expect(result).not.toContain('## Pages')
  })
})
