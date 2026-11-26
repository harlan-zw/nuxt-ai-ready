import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import markdown from '../../src/runtime/server/middleware/markdown'
import { serveCloudflarePrerenderedPage } from '../../src/runtime/server/utils/cloudflare-prerendered'
import { buildNegotiationContext, decideNegotiation, ensureSiteConfig } from '../../src/runtime/server/utils/negotiation-response'

const { runtimeConfig, createMatcher, initSiteConfig } = vi.hoisted(() => ({
  runtimeConfig: {
    'app': { baseURL: '/docs/' },
    'nitro': { routeRules: {} as Record<string, object> },
    'nuxt-ai-ready': { contentNegotiation: 'auto', botNegotiation: false },
  },
  createMatcher: vi.fn(),
  initSiteConfig: vi.fn(),
}))
vi.mock('nuxtseo-shared/server', async (original) => {
  const actual = await original<typeof import('nuxtseo-shared/server')>()
  createMatcher.mockImplementation(actual.createNitroRouteRuleMatcher)
  return { ...actual, createNitroRouteRuleMatcher: createMatcher }
})
vi.mock('#nuxtseo/nitro', () => ({
  defineNitroPlugin: (plugin: unknown) => plugin,
  useRuntimeConfig: vi.fn(() => structuredClone(runtimeConfig)),
}))
vi.mock('#site-config/server/composables/utils', () => ({
  withSiteUrl: (_event: unknown, path: string) => `https://example.com${path}`,
}))
vi.mock('#site-config/server/init', () => ({ initRequestSiteConfig: initSiteConfig }))
vi.mock('#ai-ready-virtual/agent-skills.mjs', () => ({
  localAgentSkillArtifacts: { '/skills/example.md': {} },
}))
vi.mock('#ai-ready-virtual/cloudflare-fallback-paths.mjs', () => ({
  default: new Set(['/docs/about']),
}))

function event(path = '/docs/about', accept = 'text/markdown') {
  return {
    req: new Request(`https://example.com${path}`, {
      headers: { accept },
    }),
    path,
    method: 'GET',
    context: {},
    res: {
      headers: new Headers(),
    },
  } as unknown as H3Event
}

beforeEach(() => {
  vi.clearAllMocks()
  runtimeConfig.app.baseURL = '/docs/'
  runtimeConfig.nitro.routeRules = {}
  runtimeConfig['nuxt-ai-ready'].contentNegotiation = 'auto'
})

describe('request-time configuration', () => {
  it('keeps overrides and rebuilds only when matcher inputs change', async () => {
    runtimeConfig.nitro.routeRules = {
      '/**': { cache: true },
    }
    expect(decideNegotiation(event(), 'early')._tag).toBe('html')
    expect(decideNegotiation(event(), 'early')._tag).toBe('html')
    expect(createMatcher).toHaveBeenCalledTimes(1)

    runtimeConfig.nitro.routeRules = {
      '/**': {
        cache: false,
        site: { name: 'Request site' },
      },
    }
    const request = event()
    vi.mocked(useRuntimeConfig).mockClear()
    expect(decideNegotiation(request, 'early')._tag).toBe('redirect')
    await ensureSiteConfig(request)
    expect(initSiteConfig).toHaveBeenLastCalledWith(request, 'https://example.com', {
      cache: false,
      site: { name: 'Request site' },
    })
    expect(useRuntimeConfig).toHaveBeenCalledTimes(1)
    expect(createMatcher).toHaveBeenCalledTimes(2)

    runtimeConfig.app.baseURL = '/other/'
    expect(buildNegotiationContext(event(), '/about').resolvePath('/about.md')).toBe('/other/about.md')
    runtimeConfig['nuxt-ai-ready'].contentNegotiation = 'disabled'
    expect(decideNegotiation(event(), 'early')._tag).toBe('html')
    expect(createMatcher).toHaveBeenCalledTimes(3)
    expect(useRuntimeConfig).toHaveBeenCalledWith(request)
  })

  it('keeps skill artifacts outside negotiation without reading config', () => {
    expect(decideNegotiation(event('/skills/example.md'), 'middleware')).toEqual({ _tag: 'skip', reason: 'artifact' })
    expect(useRuntimeConfig).not.toHaveBeenCalled()
  })

  it('skips static fallback without an assets binding', () => {
    expect(serveCloudflarePrerenderedPage(event())).toBeUndefined()
    expect(useRuntimeConfig).not.toHaveBeenCalled()
  })

  it('serves a prerendered asset without reading runtime config', async () => {
    const request = event('/docs/about', 'text/html')
    const fetch = vi.fn(async () => new Response('<h1>About</h1>'))
    request.context.cloudflare = {
      env: {
        ASSETS: { fetch },
      },
    }
    expect(await (await serveCloudflarePrerenderedPage(request))?.text()).toBe('<h1>About</h1>')
    expect(useRuntimeConfig).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('falls through synchronously for a live HTML page', () => {
    const request = event('/docs/live', 'text/html')
    const fetch = vi.fn()
    request.context.cloudflare = {
      env: {
        ASSETS: { fetch },
      },
    }
    expect(serveCloudflarePrerenderedPage(request)).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
    expect(useRuntimeConfig).not.toHaveBeenCalled()
  })
})

vi.mock('../../src/runtime/server/utils/content', () => ({
  tryGetContentMarkdown: vi.fn(),
}))
vi.mock('../../src/runtime/server/utils', () => ({
  convertHtmlToMarkdown: vi.fn(),
  extractLastUpdated: vi.fn(),
}))

it('runs Markdown middleware for an API without reading config', async () => {
  expect(await markdown(event('/api/data', 'application/json'))).toBeUndefined()
  expect(useRuntimeConfig).not.toHaveBeenCalled()
})
