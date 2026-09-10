import { describe, expect, it } from 'vitest'
import { planStaticMarkdownHeaderRules } from '../../src/utils/static-markdown-headers'

const headers = { 'Content-Type': 'text/markdown; charset=utf-8' }
const twin = (i: number) => ({ route: `/page-${i}.md`, headers })

describe('planStaticMarkdownHeaderRules', () => {
  it('applies every twin when the file stays under the limit', () => {
    const routeRules = { '/*': { headers: { 'X-A': '1' } }, '/llms.txt': { headers }, '/old': { redirect: '/new' } }
    const rules = [twin(1), twin(2)]

    expect(planStaticMarkdownHeaderRules(routeRules, rules, 4)).toEqual({ _tag: 'apply', rules })
  })

  it('skips the twins and names the registered ones to drop when over the limit', () => {
    const routeRules = {
      '/*': { headers: { 'X-A': '1' } },
      '/guide/a.md': { headers },
      '/guide/b.md': { headers },
      '/api/:id': { headers },
    }
    const rules = [{ route: '/guide/b.md', headers }, { route: '/guide/c.md', headers }]

    expect(planStaticMarkdownHeaderRules(routeRules, rules, 3)).toEqual({
      _tag: 'skip',
      drop: ['/guide/a.md', '/guide/b.md'],
      total: 4,
      dropped: 3,
    })
  })

  it('never skips without a limit', () => {
    const routeRules = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`/p${i}.md`, { headers }]))
    const rules = [twin(1)]

    expect(planStaticMarkdownHeaderRules(routeRules, rules, null)).toEqual({ _tag: 'apply', rules })
  })

  it('does not count the glob as a per-page rule', () => {
    const routeRules = { '/*.md': { headers }, '/a.md': { headers } }

    expect(planStaticMarkdownHeaderRules(routeRules, [twin(2)], 2)).toEqual({
      _tag: 'skip',
      drop: ['/a.md'],
      total: 3,
      dropped: 2,
    })
  })
})
