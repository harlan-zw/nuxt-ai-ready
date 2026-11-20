import { createApp, eventHandler, toWebHandler } from 'h3'
import { expect, it, vi } from 'vitest'

const loadConverter = vi.hoisted(() => vi.fn())

vi.mock('#ai-ready-virtual/content-lookup.mjs', () => ({ lookupContentPage: vi.fn() }))

vi.mock('mdream', () => {
  loadConverter()
  return { htmlToMarkdown: vi.fn() }
})

vi.mock('../../src/runtime/server/utils/negotiation-response', () => ({
  decideNegotiation: () => ({ _tag: 'skip', reason: 'not-a-page' }),
  applyNegotiation: async () => undefined,
  buildNegotiationContext: vi.fn(),
  ensureSiteConfig: vi.fn(),
  setMarkdownHeaders: vi.fn(),
}))

vi.mock('#nuxtseo/nitro', () => ({
  useNitroApp: vi.fn(),
  useRuntimeConfig: vi.fn(),
}))

it('serves normal HTML without loading the Markdown converter', async () => {
  const { default: middleware } = await import('../../src/runtime/server/middleware/markdown')
  const app = createApp()
  app.use(middleware)
  app.use(eventHandler(() => '<h1>Homepage</h1>'))

  const response = await toWebHandler(app)(new Request('https://example.com/'))

  expect(await response.text()).toBe('<h1>Homepage</h1>')
  expect(loadConverter).not.toHaveBeenCalled()
})
