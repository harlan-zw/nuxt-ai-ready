import { describe, expect, it } from 'vitest'
import { createLlmsTxtFiles, parseLlmsTxtConfig } from '../../src/runtime/llms-txt-files'
import { normalizeLlmsTxtConfig } from '../../src/runtime/llms-txt-format'

const header = '# Example\n\n> Example site\n\n'
const resolveUrl = (path: string) => `https://example.com${path}`

function build(pages: number, maxLength = 1024) {
  return createLlmsTxtFiles({
    header,
    config: { maxLength, sections: [] },
    sections: [],
    pages: Array.from({ length: pages }, (_, i) => ({ pathname: `/page-${i}`, title: `Page ${i}`, href: resolveUrl(`/page-${i}.md`) })),
    sitemapPages: new Map(),
    resolveUrl,
  })
}

describe('llms.txt files', () => {
  it('keeps a small site inline', () => {
    const files = build(2)
    expect([...files.keys()]).toEqual(['/llms.txt'])
    expect(files.get('/llms.txt')).toContain('[Page 0](https://example.com/page-0.md)')
  })

  it('splits a large site without losing pages or exceeding the limit', () => {
    const files = build(300)
    const root = files.get('/llms.txt')!
    expect(root).not.toContain('page-0.md')
    expect(files.size).toBeGreaterThan(2)
    const allLinks = [...files.values()].join('\n')
    for (let i = 0; i < 300; i++)
      expect(allLinks.split(`](https://example.com/page-${i}.md)`)).toHaveLength(2)
    for (const [path, text] of files) {
      expect(text.length).toBeLessThanOrEqual(1024)
      if (path !== '/llms.txt')
        expect(allLinks).toContain(`](${resolveUrl(path)})`)
    }
  })

  it('uses named sitemap sections and retains metadata', () => {
    const files = createLlmsTxtFiles({
      header,
      config: {},
      sections: [{ title: 'Skills', sitemap: 'skills', path: '/llms/skills.txt', description: 'Install a skill.' }],
      pages: [{ pathname: '/about', href: resolveUrl('/about.md') }],
      sitemapPages: new Map([['skills', [{ pathname: '/skill', title: 'A Skill', description: 'Instructions', href: resolveUrl('/skill.md') }]]]),
      resolveUrl,
    })
    expect(files.get('/llms.txt')).toContain('[Skills](https://example.com/llms/skills.txt)')
    expect(files.get('/llms.txt')).toContain('/about.md')
    expect(files.get('/llms/skills.txt')).toContain('[A Skill](https://example.com/skill.md): Instructions')
  })

  it('does not advertise empty sitemap files', () => {
    const files = createLlmsTxtFiles({ header, config: {}, sections: [{ title: 'Empty', sitemap: 'empty' }], pages: [], sitemapPages: new Map(), resolveUrl })
    expect([...files.keys()]).toEqual(['/llms.txt'])
    expect(files.get('/llms.txt')).not.toContain('Empty')
  })

  it('accepts underscore-containing sitemap names with their default file path', () => {
    const config = { sections: [{ title: 'Agent Skills', sitemap: 'agent_skills' }] }
    expect(parseLlmsTxtConfig(config)._tag).toBe('Valid')
    const files = createLlmsTxtFiles({ header, config, sections: config.sections, pages: [], sitemapPages: new Map([['agent_skills', [{ pathname: '/skill' }]]]), resolveUrl })
    expect(files.get('/llms.txt')).toContain('https://example.com/llms/agent_skills.txt')
    expect(files.get('/llms/agent_skills.txt')).toContain('](/skill)')
  })

  it('uses multiple index levels when the root cannot hold every chunk link', () => {
    const files = build(2500)
    for (const text of files.values())
      expect(text.length).toBeLessThanOrEqual(1024)
    const visited = new Set<string>()
    function visit(path: string) {
      if (visited.has(path))
        return
      visited.add(path)
      for (const match of files.get(path)!.matchAll(/\]\(https:\/\/example.com(\/llms\/[^)]+)\)/g))
        visit(match[1]!)
    }
    visit('/llms.txt')
    expect(visited.size).toBe(files.size)
  })

  it.each([false, true])('splits configured links without losing descriptions or optional semantics: %s', (optional) => {
    const description = 'A full link description. '.repeat(8)
    const links = Array.from({ length: 100 }, (_, i) => ({ title: `Skill ${i}`, href: `https://example.com/custom-${i}`, description }))
    const section = { title: 'Skills', description: 'Install a skill.', optional, links }
    const files = createLlmsTxtFiles({ header, config: { maxLength: 1024 }, sections: [section], pages: [{ pathname: '/about' }], sitemapPages: new Map(), resolveUrl })
    const seen = new Set<string>()
    function visit(path: string) {
      if (seen.has(path))
        return
      seen.add(path)
      const text = files.get(path)!
      expect(text.length).toBeLessThanOrEqual(1024)
      for (const match of text.matchAll(/\]\(https:\/\/example.com(\/llms\/[^)]+)\)/g))
        visit(match[1]!)
      if (optional && path !== '/llms.txt')
        expect(text).toContain('## Optional')
    }
    visit('/llms.txt')
    expect(seen.size).toBe(files.size)
    const all = [...files.values()].join('\n')
    for (const entry of links)
      expect(all.split(`](${entry.href})`)).toHaveLength(2)
    expect(all).toContain(description.trim())
    expect(files.get('/llms.txt')).toContain('Install a skill.')
    expect(files.get('/llms.txt')).toContain('](/about)')
  })

  it('bounds a root containing many small configured sections with sitemap and automatic pages', () => {
    const sections = Array.from({ length: 100 }, (_, i) => ({ title: `Group ${i}`, optional: i % 2 === 0, description: `Group description ${i}`, links: [{ title: `Custom ${i}`, href: `https://example.com/custom-${i}` }] }))
    const files = createLlmsTxtFiles({ header, config: { maxLength: 1024 }, sections: [...sections, { title: 'Selected', sitemap: 'selected' }], pages: [{ pathname: '/about' }], sitemapPages: new Map([['selected', [{ pathname: '/selected' }]]]), resolveUrl })
    const seen = new Set<string>()
    function visit(path: string) {
      if (seen.has(path))
        return
      seen.add(path)
      const text = files.get(path)!
      expect(text.length).toBeLessThanOrEqual(1024)
      for (const match of text.matchAll(/\]\(https:\/\/example.com(\/llms\/[^)]+)\)/g))
        visit(match[1]!)
    }
    visit('/llms.txt')
    expect(seen.size).toBe(files.size)
    const all = [...files.values()].join('\n')
    for (let i = 0; i < 100; i++) {
      expect(all.split(`](https://example.com/custom-${i})`)).toHaveLength(2)
      expect(all).toContain(`Group description ${i}`)
    }
    expect(all.split('](/about)')).toHaveLength(2)
    expect(all.split('](/selected)')).toHaveLength(2)
    expect(files.get('/llms.txt')).toContain('## Optional')
  })

  it('reserves space for automatic page discovery beside a nearly full configured root', () => {
    const sections = [{ title: 'Resources', links: Array.from({ length: 30 }, (_, i) => ({ title: `Resource ${i}`, href: `https://example.com/${'long-resource-name-'.repeat(4)}${i}` })) }]
    const maxLength = `${header.trim()}\n\n${normalizeLlmsTxtConfig({ sections })}`.length + 20
    const files = createLlmsTxtFiles({ header, config: { maxLength }, sections, pages: Array.from({ length: 300 }, (_, i) => ({ pathname: `/page-${i}` })), sitemapPages: new Map(), resolveUrl })
    for (const text of files.values())
      expect(text.length).toBeLessThanOrEqual(maxLength)
    expect([...files.values()].join('\n')).toContain('](/page-299)')
  })

  it.each([false, true])('preserves description-only sections across reachable bounded files, mixed lists: %s', (mixed) => {
    const contexts = Array.from({ length: 25 }, (_, i) => ({ title: `Context ${i}`, description: [`First paragraph ${i}.`, `Second paragraph ${i}.`] }))
    const sections = [...contexts, { title: 'Ignored', optional: true, description: 'Hidden optional context.' }, ...(mixed ? [{ title: 'Resources', links: [{ title: 'Resource', href: 'https://resources.example.com/resource' }] }, { title: 'Selected', sitemap: 'selected' }] : [])]
    const files = createLlmsTxtFiles({ header, config: { maxLength: 1024 }, sections, pages: mixed ? [{ pathname: '/about' }] : [], sitemapPages: new Map([['selected', [{ pathname: '/selected' }]]]), resolveUrl })
    const seen = new Set<string>()
    function visit(path: string) {
      if (seen.has(path))
        return
      seen.add(path)
      const text = files.get(path)!
      expect(text.length).toBeLessThanOrEqual(1024)
      for (const match of text.matchAll(/\]\(https:\/\/example.com(\/llms\/[^)]+)\)/g))
        visit(match[1]!)
    }
    visit('/llms.txt')
    expect(seen.size).toBe(files.size)
    const all = [...seen].map(path => files.get(path)).join('\n')
    for (let i = 0; i < contexts.length; i++)
      expect(all).toContain(`First paragraph ${i}.\n\nSecond paragraph ${i}.`)
    expect(all).not.toContain('Hidden optional context.')
    if (mixed) {
      expect(all.split('](https://resources.example.com/resource)')).toHaveLength(2)
      expect(all.split('](/about)')).toHaveLength(2)
      expect(all.split('](/selected)')).toHaveLength(2)
    }
  })

  it('rejects description-only context that cannot fit one bounded document', () => {
    expect(() => createLlmsTxtFiles({ header, config: { maxLength: 1024 }, sections: [{ title: 'Context', description: 'Required instructions. '.repeat(100) }], pages: [], sitemapPages: new Map(), resolveUrl })).toThrow(/maxLength/)
  })

  it('splits valid long descriptions even when each leaf holds only one link', () => {
    const links = Array.from({ length: 20 }, (_, i) => ({ title: `Resource ${i}`, href: `https://example.com/resource-${i}`, description: 'Detailed instructions. '.repeat(30) }))
    const files = createLlmsTxtFiles({ header, config: { maxLength: 1024 }, sections: [{ title: 'Resources', links }], pages: [], sitemapPages: new Map(), resolveUrl })
    for (const text of files.values())
      expect(text.length).toBeLessThanOrEqual(1024)
    const all = [...files.values()].join('\n')
    for (const entry of links)
      expect(all.split(`](${entry.href})`)).toHaveLength(2)
    const seen = new Set<string>()
    function visit(path: string) {
      if (seen.has(path))
        return
      seen.add(path)
      for (const match of files.get(path)!.matchAll(/\]\(https:\/\/example.com(\/llms\/[^)]+)\)/g))
        visit(match[1]!)
    }
    visit('/llms.txt')
    expect(seen.size).toBe(files.size)
  })

  it.each([
    { maxLength: 0 },
    { maxLength: 1024.5 },
    { sections: [{ title: 'Bad', sitemap: 'skills', path: '/api/private' }] },
    { sections: [{ title: 'Bad', sitemap: 'skills', path: '/llms/_pages.txt' }] },
    { sections: [{ title: 'Bad', sitemap: [], path: '/llms/skills.txt' }] },
    { sections: [{ title: 'A', sitemap: 'skills' }, { title: 'B', sitemap: 'skills' }] },
  ])('rejects invalid configuration before serving files: %j', (config) => {
    expect(parseLlmsTxtConfig(config)._tag).toBe('Invalid')
  })
})
