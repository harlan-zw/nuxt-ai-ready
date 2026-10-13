import { describe, expect, it } from 'vitest'
import { insertLlmsTxtDirective, llmsTxtDirective } from '../../src/runtime/llms-txt-directive'

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
})
