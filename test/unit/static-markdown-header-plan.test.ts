import { describe, expect, it } from 'vitest'
import { applyStaticMarkdownHeaderPlan, planStaticMarkdownHeaderRules } from '../../src/utils/static-markdown-headers'

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
      total: 5,
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

  it('counts :param route rules that carry headers, because Nitro writes them into _headers', () => {
    const routeRules = { '/a/:id': { headers }, '/x.md': { headers } }

    expect(planStaticMarkdownHeaderRules(routeRules, [], 1)).toEqual({
      _tag: 'skip',
      drop: ['/x.md'],
      total: 2,
      dropped: 1,
    })
  })

  it('keeps non-header options on the registered rules the skip strips', () => {
    const routeRules = { '/old.md': { redirect: '/new.md', headers } } satisfies Record<string, object | undefined>
    const plan = planStaticMarkdownHeaderRules(routeRules, [twin(1)], 1)

    expect(plan).toEqual({ _tag: 'skip', drop: ['/old.md'], total: 2, dropped: 2 })
    applyStaticMarkdownHeaderPlan(routeRules, plan)

    const rule = routeRules['/old.md'] as { redirect?: string, headers?: unknown }
    expect(rule.redirect).toBe('/new.md')
    expect(rule.headers).toBeUndefined()
  })

  it('applies twin rules onto existing entries without clobbering them', () => {
    const routeRules = { '/page-1.md': { prerender: true } } satisfies Record<string, object | undefined>

    applyStaticMarkdownHeaderPlan(routeRules, { _tag: 'apply', rules: [twin(1)] })

    expect(routeRules['/page-1.md']).toEqual({ prerender: true, headers })
  })
})
