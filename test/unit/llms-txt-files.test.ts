import { describe, expect, it } from 'vitest'
import { createLlmsTxtFiles, parseLlmsTxtConfig } from '../../src/runtime/llms-txt-files'

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
