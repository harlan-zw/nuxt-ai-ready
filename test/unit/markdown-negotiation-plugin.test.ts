import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHeaders, getRequestURL, getResponseHeader } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'

const { prerenderedHeaders } = vi.hoisted(() => ({
  prerenderedHeaders: new Map<string, Record<string, string>>([
    [
      '/about.md',
      { 'cache-control': 'public, max-age=3600' },
    ],
    [
      '/café.md',
      { 'cache-control': 'public, max-age=3600' },
    ],
  ]),
}))

vi.mock('#ai-ready-virtual/prerendered-markdown-headers.mjs', () => ({
  default: prerenderedHeaders,
}))
vi.mock('#ai-ready-virtual/agent-skills.mjs', () => ({
  localAgentSkillArtifacts: {},
}))
vi.mock('#ai-ready-virtual/cloudflare-fallback-paths.mjs', () => ({
  default: new Set<string>(),
}))
vi.mock('#nuxtseo/h3', async (original) => {
  const h3 = await original<typeof import('#nuxtseo/h3')>()
  return {
    ...h3,
    getHeaders: vi.fn(h3.getHeaders),
    getRequestURL: vi.fn(h3.getRequestURL),
  }
})
vi.mock('#nuxtseo/nitro', () => ({
  defineNitroPlugin: (plugin: unknown) => plugin,
  useRuntimeConfig: vi.fn(() => ({
    'app': { baseURL: '/' },
    'nitro': { routeRules: {} },
    'nuxt-ai-ready': { contentNegotiation: 'auto', botNegotiation: false },
  })),
}))
vi.mock('#site-config/server/composables/utils', () => ({
  withSiteUrl: (_event: unknown, path: string) => `https://example.com${path}`,
}))
vi.mock('#site-config/server/init', () => ({
  initRequestSiteConfig: vi.fn(),
}))

const plugin = (await import('../../src/runtime/server/plugins/markdown-negotiation')).default as unknown as (nitro: { h3: { '~middleware': Array<(event: H3Event) => Promise<unknown>> } }) => void

function installHandler() {
  const middleware: Array<(event: H3Event) => Promise<unknown>> = []
  plugin({
    h3: { '~middleware': middleware },
  })
  return middleware[0]!
}

function createEvent(path: string): H3Event {
  return {
    req: new Request(`https://example.com${path}`),
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
})

describe('markdown-negotiation early handler', () => {
  it.each([
    '/__nuxt_error?url=%2Fmissing&statusCode=404&message=Not%20Found',
    '/__nuxt_error?url=/about.md&statusCode=404',
    '/wp-login.php?redirect_to=%2Fwp-admin%2F',
    '/logo.png?v=%201',
    '/.env?probe=%2F',
    '/favicon.ico',
  ])('skips %s without reading headers, request URL, or runtime config', async (path) => {
    const handler = installHandler()

    expect(await handler(createEvent(path))).toBeUndefined()
    expect(getHeaders).not.toHaveBeenCalled()
    expect(getRequestURL).not.toHaveBeenCalled()
    expect(useRuntimeConfig).not.toHaveBeenCalled()
  })

  it('still applies prerendered headers for encoded and explicit .md routes', async () => {
    const handler = installHandler()
    const event = createEvent('/caf%C3%A9.md')

    expect(await handler(event)).toBeUndefined()
    expect(getResponseHeader(event, 'cache-control')).toBe('public, max-age=3600')
  })
})
