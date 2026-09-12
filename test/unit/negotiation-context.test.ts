import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { buildNegotiationContext } from '../../src/runtime/server/utils/negotiation-response'

vi.mock('#ai-ready-virtual/agent-skills.mjs', () => ({ localAgentSkillArtifacts: {} }))
vi.mock('#nuxtseo/nitro', () => ({
  defineNitroPlugin: (plugin: unknown) => plugin,
  useRuntimeConfig: () => ({ 'app': { baseURL: '/' }, 'nuxt-ai-ready': {} }),
}))
vi.mock('#site-config/server/composables/utils', () => ({
  withSiteUrl: (_event: unknown, path: string) => `https://example.com${path}`,
}))
vi.mock('#site-config/server/middleware/init', () => ({ default: vi.fn() }))

describe('negotiation locale context', () => {
  it.each([
    [{ host: 'fr.example.com' }, 'fr.example.com'],
    [{ 'host': 'internal.proxy', 'x-forwarded-host': 'fr.example.com' }, 'fr.example.com'],
  ])('uses the public request host: %j', (headers, expectedHost) => {
    const event = { path: '/a-propos', node: { req: { headers } } } as unknown as H3Event

    const context = buildNegotiationContext(event, '/a-propos')

    expect(context.routeContext).toEqual({ host: expectedHost })
  })
})
