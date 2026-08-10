import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

// h3 is a transitive dep not directly resolvable from unit tests; stub the
// request helpers used by markdown-request.ts.
vi.mock('h3', () => ({
  getHeader: (event: any, name: string) => event.node.req.headers[name.toLowerCase()],
  getHeaders: (event: any) => event.node.req.headers,
  getRequestURL: (event: any) => new URL(event.node.req.url, 'https://example.com'),
}))
vi.mock('mdream', () => ({ htmlToMarkdown: () => '' }))
vi.mock('nitropack/runtime', () => ({ useNitroApp: () => ({ hooks: { callHook: () => {} } }) }))

const { getMarkdownRenderInfo, negotiateRepresentation } = await import('../../src/runtime/server/utils/markdown-request')

// Build a minimal H3 event for the stubbed request helpers.
function mockEvent(headers: Record<string, string>, path = '/', requestUrl = path): H3Event {
  const lower: Record<string, string> = {}
  for (const k in headers)
    lower[k.toLowerCase()] = headers[k]!
  return { node: { req: { headers: lower, url: requestUrl } }, path } as unknown as H3Event
}

describe('getMarkdownRenderInfo', () => {
  it('recognizes an explicit markdown request with a query string', () => {
    const event = mockEvent({}, '/meta/charset.md?probe=1')

    expect(getMarkdownRenderInfo(event, { _tag: 'runtime', contentNegotiation: false })).toEqual({
      path: '/meta/charset',
      isExplicit: true,
      negotiation: 'markdown',
    })
  })

  it('preserves the base-relative event path', () => {
    const event = mockEvent({}, '/about.md?probe=1', '/docs/about.md?probe=1')

    expect(getMarkdownRenderInfo(event, { _tag: 'runtime', contentNegotiation: false })).toEqual({
      path: '/about',
      isExplicit: true,
      negotiation: 'markdown',
    })
  })
})

describe('negotiateRepresentation', () => {
  // Regression for issue #36: a Nitro prerender request carries x-nitro-prerender.
  // It must resolve to HTML even when the Accept header / UA prefer markdown, so
  // the canonical prerendered artifact is never replaced with a .md redirect stub.
  it('forces HTML for prerender requests preferring markdown via Accept', () => {
    const event = mockEvent({ 'x-nitro-prerender': '/', 'accept': 'text/markdown' })
    expect(negotiateRepresentation(event)).toBe('html')
  })

  it('forces HTML for prerender requests with an AI bot user-agent', () => {
    const event = mockEvent({
      'x-nitro-prerender': '/about',
      'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)',
    })
    expect(negotiateRepresentation(event)).toBe('html')
  })

  it('still negotiates markdown for a non-prerender markdown request', () => {
    const event = mockEvent({ accept: 'text/markdown' })
    expect(negotiateRepresentation(event)).toBe('markdown')
  })

  it('serves HTML for browser navigation', () => {
    const event = mockEvent({ 'accept': 'text/html', 'sec-fetch-dest': 'document' })
    expect(negotiateRepresentation(event)).toBe('html')
  })

  it('serves markdown to AI bots outside prerender', () => {
    const event = mockEvent({
      'accept': 'text/html',
      'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)',
    })
    expect(negotiateRepresentation(event)).toBe('markdown')
  })
})
