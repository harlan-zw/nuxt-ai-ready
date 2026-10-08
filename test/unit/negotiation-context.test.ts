import type { H3Event } from 'h3'
import type { RuntimeI18nConfig } from '../../src/runtime/server/utils/i18n'
import { createSiteConfigStack } from 'site-config-stack'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHeaders, getResponseHeader } from '#nuxtseo/h3'
import { buildNegotiationContext, decideNegotiation, setLinkHeader, setStatusAwareHeader } from '../../src/runtime/server/utils/negotiation-response'

const { match, config } = vi.hoisted(() => ({
  match: vi.fn((path: string) => ({ cache: path === '/disabled' })),
  config: { 'app': { baseURL: '/' }, 'nuxt-ai-ready': { contentNegotiation: 'auto', i18n: null as RuntimeI18nConfig | null } },
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
vi.mock('nuxt/server', () => ({ useRuntimeConfig: () => config }))
vi.mock('#site-config/server/composables/utils', async () => import('../../node_modules/nuxt-site-config/dist/runtime/server/composables/utils.js'))
vi.mock('#site-config/server/init', () => ({ initRequestSiteConfig: vi.fn() }))

beforeEach(() => {
  config.app.baseURL = '/'
  config['nuxt-ai-ready'].i18n = null
})

function headerEvent(origin: string, configuredUrl = true) {
  const siteConfig = createSiteConfigStack()
  siteConfig.push({ url: configuredUrl ? origin : undefined, env: 'production' })
  const url = new URL('/about', origin)
  const event = {
    req: new Request(url),
    url,
    path: url.pathname,
    res: { headers: new Headers() },
    context: { siteConfig, siteConfigNitroOrigin: origin, _initedSiteConfig: true },
  } as unknown as H3Event
  return { event, siteConfig }
}

describe('request-specific header URL resolution', () => {
  it('keeps relative links when site configuration cannot resolve', () => {
    const { event, siteConfig } = headerEvent('https://example.com')
    siteConfig.get = () => {
      throw new Error('Site configuration unavailable')
    }
    const context = buildNegotiationContext(event, '/about')

    setLinkHeader(event, context, 'html')

    expect(getResponseHeader(event, 'link')).toBe('</about.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"')
  })

  it('keeps the request origin fallback and adds the app base once', () => {
    config.app.baseURL = '/docs/'
    const { event } = headerEvent('https://fallback.example', false)
    const context = buildNegotiationContext(event, '/about')

    setLinkHeader(event, context, 'markdown')

    expect(getResponseHeader(event, 'link')).toContain('<https://fallback.example/docs/about>; rel="canonical"')
    expect(getResponseHeader(event, 'link')).toContain('<https://fallback.example/docs/llms.txt>; rel="describedby"')
  })

  it('keeps each request origin separate when responses interleave', () => {
    const first = headerEvent('https://one.example')
    const second = headerEvent('https://two.example')
    const firstContext = buildNegotiationContext(first.event, '/about')
    const secondContext = buildNegotiationContext(second.event, '/about')

    setLinkHeader(first.event, firstContext, 'html')
    setLinkHeader(second.event, secondContext, 'html')
    setLinkHeader(first.event, firstContext, 'markdown')

    expect(getResponseHeader(first.event, 'link')).toContain('<https://one.example/about>; rel="canonical"')
    expect(getResponseHeader(second.event, 'link')).toContain('<https://two.example/about.md>; rel="alternate"')
  })

  it('reads changes made by asynchronous hooks before the next header build', async () => {
    config['nuxt-ai-ready'].i18n = {
      defaultLocale: 'en',
      strategy: 'prefix_except_default',
      locales: [{ code: 'en', hreflang: 'en' }, { code: 'fr', hreflang: 'fr' }],
    }
    const { event, siteConfig } = headerEvent('https://before.example')
    const context = buildNegotiationContext(event, '/about')
    setStatusAwareHeader(event, context, 'html')
    expect(getResponseHeader(event, 'link')).toContain('https://before.example/about.md')

    await Promise.resolve()
    siteConfig.push({ url: 'https://after.example', trailingSlash: true, _priority: 100 })
    setLinkHeader(event, context, 'markdown')

    expect(getResponseHeader(event, 'link')).toContain('<https://after.example/about/>; rel="canonical"')
    expect(context.resolveUrl('/about')).toBe('https://after.example/about/')
  })
})

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
