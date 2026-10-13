import { describe, expect, it } from 'vitest'
import { enforceStaticHeaderBudget, normalizeStaticContentSignalHeaders } from '../../src/utils/static-headers'
import { resolveCloudflareStaticHeaders } from '../helpers/cloudflare-headers'

describe('static usage policy budget', () => {
  it('preserves a removal when a generated discovery rule repeats its route', () => {
    const headers = normalizeStaticContentSignalHeaders('/notes/removed.md\n  Link: </notes/removed>; rel="canonical"\n/notes/*.md\n  Content-Signal: search=no\n/notes/removed.md\n  ! Content-Signal\n')
    expect(resolveCloudflareStaticHeaders(headers, '/notes/removed.md')['content-signal']).toBeUndefined()
  })
  it('lets specific policies and removals replace a shared static policy', () => {
    const headers = normalizeStaticContentSignalHeaders('/notes/*.md\n  Content-Signal: search=no\n/*\n  Content-Signal: ai-train=no\n/notes/removed.md\n  ! Content-Signal\n')
    expect(resolveCloudflareStaticHeaders(headers, '/notes/one.md')['content-signal']).toBe('search=no')
    expect(resolveCloudflareStaticHeaders(headers, '/notes/removed.md')['content-signal']).toBeUndefined()
    expect(resolveCloudflareStaticHeaders(headers, '/about')['content-signal']).toBe('ai-train=no')
  })
  it('retains a Markdown policy when optional discovery rules are dropped', () => {
    const policy = '/private.md\n  CONTENT-SIGNAL: ai-train=no\n'
    const result = enforceStaticHeaderBudget(`/*\n  X-A: 1\n/public.md\n  Link: </public>; rel="canonical"\n${policy}`, 2)
    expect(result).toEqual({ contents: `/*\n  X-A: 1\n${policy}`, total: 2, dropped: 1 })
  })
})
