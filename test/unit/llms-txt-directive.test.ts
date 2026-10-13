import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { insertLlmsTxtDirective, llmsTxtDirective, llmsTxtDirectiveHtml } from '../../src/runtime/llms-txt-directive'

const href = 'https://example.com/llms.txt'
const directive = llmsTxtDirective(href)

describe('insertLlmsTxtDirective', () => {
  it('names the site index in one blockquote line', () => {
    expect(directive).toBe('> Index of every page on this site: [llms.txt](https://example.com/llms.txt)')
  })

  it('places the line after the frontmatter, before the body', () => {
    const markdown = '---\ntitle: "About"\n---\n\n# About\n\nBody.\n'
    expect(insertLlmsTxtDirective(markdown, href)).toBe(`---\ntitle: "About"\n---\n\n${directive}\n\n# About\n\nBody.\n`)
  })

  it('places the line first when the page has no frontmatter', () => {
    expect(insertLlmsTxtDirective('# About\n', href)).toBe(`${directive}\n\n# About\n`)
  })

  it('adds the line once', () => {
    const once = insertLlmsTxtDirective('---\ntitle: "About"\n---\n# About\n', href)
    expect(insertLlmsTxtDirective(once, href)).toBe(once)
  })

  it.each(['\n', '\r\n'])('preserves empty frontmatter with %j line endings', (newline) => {
    const frontmatter = `---${newline}---${newline}`
    const markdown = `${frontmatter}${newline}# Page`
    expect(insertLlmsTxtDirective(markdown, href)).toBe(`${frontmatter}\n${directive}\n\n# Page`)
  })

  it('adds the leading directive when the body contains a fenced example', () => {
    const markdown = `---\ntitle: Example\n---\n\n# Page\n\n\`\`\`md\n${directive}\n\`\`\``
    expect(insertLlmsTxtDirective(markdown, href)).toBe(`---\ntitle: Example\n---\n\n${directive}\n\n# Page\n\n\`\`\`md\n${directive}\n\`\`\``)
  })
})

describe('llmsTxtDirectiveHtml', () => {
  it('keeps the visually hidden index link outside sequential keyboard navigation', () => {
    const window = new Window()
    window.document.body.innerHTML = llmsTxtDirectiveHtml('/llms.txt')
    const link = window.document.querySelector('a')!
    expect(link.tabIndex).toBe(-1)
    expect(link.getAttribute('href')).toBe('/llms.txt')
  })
})
