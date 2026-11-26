import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  error: { value: undefined as unknown },
  pathname: '/',
  baseURL: '/',
  config: {} as Record<string, unknown>,
  eventContext: {} as Record<string, unknown>,
  headInputs: [] as Array<unknown>,
}))

vi.mock('nuxt/app', () => ({
  defineNuxtPlugin: (plugin: { setup: () => void }) => plugin,
  useError: () => state.error,
  useRequestURL: () => new URL(`https://example.com${state.pathname}`),
  useRuntimeConfig: () => ({
    'app': { baseURL: state.baseURL },
    'nuxt-ai-ready': state.config,
  }),
  useRequestEvent: () => ({ context: state.eventContext }),
  useHead: vi.fn((input: unknown) => {
    state.headInputs.push(input)
  }),
}))

const { useHead } = await import('nuxt/app')
const plugin = (await import('../../src/runtime/app/plugins/md-alternate.server')).default as unknown as { setup: () => void }

function resolveLinks(): Array<Record<string, unknown>> {
  const input = state.headInputs.at(-1)
  if (!input)
    return []
  const resolved = typeof input === 'function'
    ? (input as () => { link?: Array<Record<string, unknown>> })()
    : input as { link?: Array<Record<string, unknown>> }
  return resolved.link ?? []
}

beforeEach(() => {
  state.error.value = undefined
  state.pathname = '/'
  state.baseURL = '/'
  state.config = {}
  state.eventContext = {}
  state.headInputs = []
  vi.mocked(useHead).mockClear()
})

describe('md-alternate.server plugin', () => {
  it('skips error pages when useError() is already populated', () => {
    state.pathname = '/missing-page'
    state.error.value = { statusCode: 404, message: 'Page not found' }

    plugin.setup()

    expect(useHead).not.toHaveBeenCalled()
  })

  it('omits alternate links when useError() is set later during the SSR pass', () => {
    state.pathname = '/missing-page'

    plugin.setup()
    state.error.value = { statusCode: 404, message: 'Page not found' }

    expect(resolveLinks()).toEqual([])
  })

  it.each([
    ['/', '/__nuxt_error'],
    ['/docs/', '/docs/__nuxt_error'],
    ['/docs/', '/docs/_nuxt/entry.js'],
    ['/docs/', '/docs/api/users'],
    ['/', '/logo.png'],
    ['/', '/favicon.ico'],
    ['/', '/hero.jpg'],
    ['/', '/hero.jpeg'],
    ['/', '/hero.webp'],
    ['/', '/icon.svg'],
    ['/', '/app.js'],
    ['/', '/style.css'],
    ['/', '/font.woff2'],
    ['/', '/wp-login.php'],
    ['/', '/.env'],
  ])('skips %s request to %s without adding head links', (baseURL, pathname) => {
    state.baseURL = baseURL
    state.pathname = pathname

    plugin.setup()

    expect(useHead).not.toHaveBeenCalled()
  })

  it.each([
    ['/', '/', '/index.md', '/llms.txt'],
    [
      '/',
      '/about',
      '/about.md',
      '/llms.txt',
    ],
    [
      '/docs/',
      '/docs/',
      '/docs/index.md',
      '/docs/llms.txt',
    ],
    [
      '/docs/',
      '/docs/about',
      '/docs/about.md',
      '/docs/llms.txt',
    ],
    [
      '/docs/',
      '/docs/docs/api',
      '/docs/docs/api.md',
      '/docs/llms.txt',
    ],
  ])('injects alternate and describedby links for HTML page (%s -> %s)', (baseURL, pathname, expectedHref, expectedDescribedBy) => {
    state.baseURL = baseURL
    state.pathname = pathname

    plugin.setup()

    expect(useHead).toHaveBeenCalledTimes(1)
    expect(resolveLinks()).toEqual([
      { rel: 'alternate', type: 'text/markdown', href: expectedHref },
      { rel: 'describedby', href: expectedDescribedBy },
    ])
  })
})
