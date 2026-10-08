import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { getHeaders } from '#nuxtseo/h3'
import { buildNegotiationContext, decideNegotiation } from '../../src/runtime/server/utils/negotiation-response'

const { match, config } = vi.hoisted(() => ({
  match: vi.fn((path: string) => ({ cache: path === '/disabled' })),
  config: { 'app': { baseURL: '/' }, 'nuxt-ai-ready': { contentNegotiation: 'auto' } },
}))
vi.mock('#nuxtseo/h3', async (original) => {
  const h3 = await original<typeof import('#nuxtseo/h3')>()
  return { ...h3, getHeaders: vi.fn(h3.getHeaders) }
})
vi.mock('nuxtseo-shared/server', () => ({ createNitroRouteRuleMatcher: () => match }))

vi.mock('#ai-ready-virtual/agent-skills.mjs', () => ({ localAgentSkillArtifacts: {} }))
vi.mock('#nuxtseo/nitro', () => ({
  defineNitroPlugin: (plugin: unknown) => plugin,
  useRuntimeConfig: () => config,
}))
vi.mock('#site-config/server/composables/utils', () => ({
  withSiteUrl: (_event: unknown, path: string) => `https://example.com${path}`,
}))
vi.mock('#site-config/server/init', () => ({ initRequestSiteConfig: vi.fn() }))

describe('negotiation locale context', () => {
  it.each([
    [{ host: 'fr.example.com' }, 'fr.example.com'],
    [{ 'host': 'internal.proxy', 'x-forwarded-host': 'fr.example.com' }, 'fr.example.com'],
  ])('uses the public request host: %j', (headers, expectedHost) => {
    const event = { req: new Request('https://example.com/a-propos', { headers }), path: '/a-propos' } as unknown as H3Event

    const context = buildNegotiationContext(event, '/a-propos')

    expect(context.routeContext).toEqual({ host: expectedHost })
  })
})

describe('request-scoped negotiation', () => {
  it('reads headers and matches the route once across both stages', () => {
    vi.mocked(getHeaders).mockClear()
    match.mockClear()
    const event = { req: new Request('https://example.com/about.md'), path: '/about.md', context: {} } as unknown as H3Event

    expect(decideNegotiation(event, 'early')).toEqual({ _tag: 'skip', reason: 'deferred' })
    expect(decideNegotiation(event, 'middleware')).toEqual({ _tag: 'render', path: '/about' })
    expect(getHeaders).toHaveBeenCalledTimes(1)
    expect(match).toHaveBeenCalledTimes(1)
  })

  it('rechecks the route policy after middleware rewrites the path', () => {
    const event = { req: new Request('https://example.com/about', { headers: { accept: 'text/markdown' } }), path: '/about', context: {} } as unknown as H3Event
    expect(decideNegotiation(event, 'early')).toEqual({ _tag: 'redirect', path: '/about' })
    Object.assign(event, { path: '/disabled' })

    expect(decideNegotiation(event, 'middleware')).toMatchObject({ _tag: 'html', path: '/disabled' })
  })

  it('does not reuse negotiation for a new request sharing a context', () => {
    const context = {}
    const first = { req: new Request('https://example.com/about', { headers: { accept: 'text/html' } }), path: '/about', context } as unknown as H3Event
    const second = { req: new Request('https://example.com/about', { headers: { accept: 'text/markdown' } }), path: '/about', context } as unknown as H3Event

    expect(decideNegotiation(first, 'early')).toMatchObject({ _tag: 'html' })
    expect(decideNegotiation(second, 'middleware')).toEqual({ _tag: 'redirect', path: '/about' })
  })
})
