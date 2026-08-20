import type { NegotiationInput } from '../../src/runtime/server/utils/negotiation-decision'
import { describe, expect, it } from 'vitest'
import { resolveNegotiationDecision } from '../../src/runtime/server/utils/negotiation-decision'

function input(overrides: {
  path: string
  headers?: Record<string, string>
  stage?: NegotiationInput['stage']
  policy?: NegotiationInput['policy']
  routeRule?: NegotiationInput['routeRule']
  isPrerender?: boolean
}): NegotiationInput {
  return {
    stage: overrides.stage ?? 'early',
    request: {
      path: overrides.path,
      headers: overrides.headers ?? {},
      isPrerender: overrides.isPrerender ?? false,
    },
    routeRule: overrides.routeRule ?? {},
    policy: overrides.policy ?? 'auto',
  }
}

describe('resolveNegotiationDecision', () => {
  // Regression for issue #82: the static asset handler answers a prerendered
  // route before any middleware, so the early stage must reach the redirect.
  it('redirects a markdown client to the .md twin at the early stage', () => {
    expect(resolveNegotiationDecision(input({
      path: '/about',
      headers: { accept: 'text/markdown' },
    }))).toEqual({ _tag: 'redirect', path: '/about' })
  })

  it('redirects the root path', () => {
    expect(resolveNegotiationDecision(input({
      path: '/',
      headers: { accept: 'text/markdown' },
    }))).toEqual({ _tag: 'redirect', path: '/' })
  })

  it('ignores the query string when it resolves the path', () => {
    expect(resolveNegotiationDecision(input({
      path: '/about?ref=agent',
      headers: { accept: 'text/markdown' },
    }))).toEqual({ _tag: 'redirect', path: '/about' })
  })

  it('redirects an AI bot that asks for HTML', () => {
    expect(resolveNegotiationDecision(input({
      path: '/about',
      headers: {
        'accept': 'text/html',
        'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)',
      },
    }))).toEqual({ _tag: 'redirect', path: '/about' })
  })

  it('passes browser navigation through as HTML', () => {
    expect(resolveNegotiationDecision(input({
      path: '/about',
      headers: { 'accept': 'text/html,*/*', 'sec-fetch-dest': 'document' },
    }))).toEqual({
      _tag: 'html',
      path: '/about',
      negotiation: { _tag: 'enabled', source: 'default' },
    })
  })

  it('leaves an explicit .md request to the middleware', () => {
    expect(resolveNegotiationDecision(input({
      path: '/about.md',
      stage: 'early',
    }))).toEqual({ _tag: 'skip', reason: 'deferred' })

    expect(resolveNegotiationDecision(input({
      path: '/about.md',
      stage: 'middleware',
    }))).toEqual({ _tag: 'render', path: '/about' })
  })

  it('skips the internal HTML fetch that the markdown handler makes', () => {
    expect(resolveNegotiationDecision(input({
      path: '/about',
      headers: { 'accept': 'text/markdown', 'x-ai-ready-internal': '1' },
    }))).toEqual({ _tag: 'skip', reason: 'internal' })
  })

  it('skips well-known paths', () => {
    expect(resolveNegotiationDecision(input({
      path: '/.well-known/security.txt',
      headers: { accept: 'text/markdown' },
    }))).toEqual({ _tag: 'skip', reason: 'well-known' })
  })

  it('skips API routes and static assets', () => {
    expect(resolveNegotiationDecision(input({
      path: '/api/pages',
      headers: { accept: 'text/markdown' },
    }))).toEqual({ _tag: 'skip', reason: 'not-a-page' })

    expect(resolveNegotiationDecision(input({
      path: '/styles/main.css',
      headers: { accept: 'text/markdown' },
    }))).toEqual({ _tag: 'skip', reason: 'not-a-page' })
  })

  it('serves HTML during prerender even when the client asks for markdown', () => {
    expect(resolveNegotiationDecision(input({
      path: '/about',
      headers: { accept: 'text/markdown' },
      isPrerender: true,
    }))).toMatchObject({ _tag: 'html', path: '/about' })
  })

  it('serves HTML when the policy disables negotiation', () => {
    expect(resolveNegotiationDecision(input({
      path: '/about',
      headers: { accept: 'text/markdown' },
      policy: 'disabled',
    }))).toEqual({
      _tag: 'html',
      path: '/about',
      negotiation: { _tag: 'disabled', source: 'explicit' },
    })
  })

  it('serves HTML when an ISR route rule caches the response', () => {
    expect(resolveNegotiationDecision(input({
      path: '/about',
      headers: { accept: 'text/markdown' },
      routeRule: { isr: true },
    }))).toEqual({
      _tag: 'html',
      path: '/about',
      negotiation: { _tag: 'disabled', source: 'isr' },
    })
  })

  it('reports an unsupported Accept header at both stages', () => {
    for (const stage of ['early', 'middleware'] as const) {
      expect(resolveNegotiationDecision(input({
        path: '/about',
        headers: { accept: 'application/pdf' },
        stage,
      }))).toEqual({ _tag: 'not-acceptable' })
    }
  })
})
