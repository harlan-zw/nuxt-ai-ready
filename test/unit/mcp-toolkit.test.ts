import { describe, expect, it } from 'vitest'
import { hasConfiguredNuxtModule, resolveMcpToolkitState } from '../../src/utils/mcp'

describe('resolveMcpToolkitState', () => {
  it('detects a toolkit configured after AI Ready', () => {
    expect(hasConfiguredNuxtModule([
      'nuxt-ai-ready',
      ['@nuxtjs/mcp-toolkit', { enabled: true }],
    ], '@nuxtjs/mcp-toolkit')).toBe(true)
  })

  it('enables an installed server with its configured route', () => {
    expect(resolveMcpToolkitState({
      installed: true,
      options: { enabled: true, route: '/agent/mcp' },
      static: false,
      generating: false,
    })).toEqual({ _tag: 'Enabled', route: '/agent/mcp' })
  })

  it.each([
    { options: false as const, static: false, generating: false, tag: 'Disabled' },
    { options: { enabled: false }, static: false, generating: false, tag: 'Disabled' },
    { options: undefined, static: true, generating: false, tag: 'Static' },
    { options: undefined, static: false, generating: true, tag: 'Static' },
  ])('does not advertise an unavailable server: $tag', ({ options, static: isStatic, generating, tag }) => {
    expect(resolveMcpToolkitState({
      installed: true,
      options,
      static: isStatic,
      generating,
    })._tag).toBe(tag)
  })
})
