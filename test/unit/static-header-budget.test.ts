import { describe, expect, it } from 'vitest'
import { enforceStaticHeaderBudget } from '../../src/utils/static-headers'

function headersFile(rules: Array<[route: string, ...headers: string[]]>): string {
  return `${rules.map(([route, ...headers]) => [route, ...headers.map(h => `  ${h}`)].join('\n')).join('\n')}\n`
}

function markdownTwins(count: number): Array<[string, ...string[]]> {
  return Array.from({ length: count }, (_, i): [string, ...string[]] => [
    `/page-${i}.md`,
    'Content-Type: text/markdown; charset=utf-8',
    `Link: </page-${i}>; rel="canonical"`,
  ])
}

describe('enforceStaticHeaderBudget', () => {
  it('leaves a file within budget untouched', () => {
    const contents = headersFile([
      ['/*', 'X-Frame-Options: DENY'],
      ['/*.md', 'Content-Type: text/markdown; charset=utf-8'],
      ...markdownTwins(3),
    ])

    expect(enforceStaticHeaderBudget(contents, 100)).toEqual({ contents, total: 5, dropped: 0 })
  })

  it('drops the exact markdown rules first and keeps the glob and every other rule', () => {
    const contents = headersFile([
      ['/*', 'X-Frame-Options: DENY'],
      ['/*.md', 'Content-Type: text/markdown; charset=utf-8', 'Link: </llms.txt>; rel="describedby"'],
      ...markdownTwins(4),
      ['/llms.txt', 'Content-Type: text/plain; charset=utf-8'],
    ])

    const result = enforceStaticHeaderBudget(contents, 4)

    expect(result).toEqual({
      contents: headersFile([
        ['/*', 'X-Frame-Options: DENY'],
        ['/*.md', 'Content-Type: text/markdown; charset=utf-8', 'Link: </llms.txt>; rel="describedby"'],
        ['/llms.txt', 'Content-Type: text/plain; charset=utf-8'],
      ]),
      total: 3,
      dropped: 4,
    })
  })

  it('reports a file still over budget once no markdown rule is left to drop', () => {
    const contents = headersFile([
      ['/a', 'X-A: 1'],
      ['/b', 'X-B: 1'],
      ['/c', 'X-C: 1'],
      ['/only.md', 'Content-Type: text/markdown; charset=utf-8'],
    ])

    const result = enforceStaticHeaderBudget(contents, 2)

    expect(result.dropped).toBe(1)
    expect(result.total).toBe(3)
    expect(result.contents).not.toContain('/only.md')
  })

  it('ignores comments and blank lines when counting rules', () => {
    const contents = ['# generated', '', '/a', '  X-A: 1', '', '/b', '  X-B: 1', ''].join('\n')

    expect(enforceStaticHeaderBudget(contents, 2)).toEqual({ contents, total: 2, dropped: 0 })
  })
})
