import { describe, expect, it } from 'vitest'
import { resolveSiteToolsConfig, resolveWebMcpConfig } from '../../src/utils/webmcp'

describe('resolveWebMcpConfig', () => {
  it('keeps WebMCP disabled when no option is provided', () => {
    expect(resolveWebMcpConfig(undefined, resolveSiteToolsConfig(undefined).config)).toEqual({ _tag: 'Disabled' })
  })

  it('attaches every shared tool for the boolean shorthand', () => {
    expect(resolveWebMcpConfig(true, resolveSiteToolsConfig(undefined).config)).toEqual({
      _tag: 'Enabled',
      config: {
        exposedTo: undefined,
        tools: {
          getPageMarkdown: {
            exposedTo: undefined,
            maxOutputChars: 1500,
          },
          listPages: {
            defaultLimit: 20,
            exposedTo: undefined,
            maxOutputChars: 1500,
          },
          searchPages: {
            defaultLimit: 10,
            exposedTo: undefined,
            maxOutputChars: 1500,
          },
        },
      },
    })
  })

  it('resolves shared behavior and transport attachments per tool', () => {
    const resolved = resolveSiteToolsConfig({
      listPages: {
        defaultLimit: 7,
        webmcp: { enabled: false },
      },
      searchPages: {
        defaultLimit: 5,
        webmcp: { maxOutputChars: 500 },
      },
      getPageMarkdown: {
        mcp: { enabled: false },
        webmcp: {
          exposedTo: ['https://agent.example.com'],
          maxOutputChars: 4000,
        },
      },
    })

    expect(resolved).toEqual({
      config: {
        getPageMarkdown: {
          mcp: { enabled: false },
          webmcp: {
            enabled: true,
            exposedTo: ['https://agent.example.com'],
            maxOutputChars: 4000,
          },
        },
        listPages: {
          defaultLimit: 7,
          mcp: { enabled: true },
          webmcp: { enabled: false },
        },
        searchPages: {
          defaultLimit: 5,
          mcp: { enabled: true },
          webmcp: {
            enabled: true,
            exposedTo: undefined,
            maxOutputChars: 500,
          },
        },
      },
      warnings: [],
    })

    expect(resolveWebMcpConfig(true, resolved.config)).toMatchObject({
      _tag: 'Enabled',
      config: {
        tools: {
          searchPages: {
            defaultLimit: 5,
            maxOutputChars: 500,
          },
        },
      },
    })
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('replaces invalid output budget %s', (maxOutputChars) => {
    const result = resolveSiteToolsConfig({
      searchPages: { webmcp: { maxOutputChars } },
    })
    const attachment = result.config.searchPages.webmcp
    expect(attachment.enabled).toBe(true)
    if (!attachment.enabled)
      throw new Error('Expected search_pages to be attached to WebMCP.')
    expect(attachment.maxOutputChars).toBe(1500)
    expect(result.warnings).toEqual([
      expect.stringContaining('tools.searchPages.webmcp.maxOutputChars'),
    ])
  })

  it('clamps shared default limits to the endpoint maximum', () => {
    const result = resolveSiteToolsConfig({
      listPages: { defaultLimit: 500 },
      searchPages: { defaultLimit: 500 },
    })
    expect(result.config.listPages.defaultLimit).toBe(50)
    expect(result.config.searchPages.defaultLimit).toBe(50)
    expect(result.warnings).toHaveLength(2)
  })

  it('supports WebMCP composables without attaching built-in tools', () => {
    const tools = resolveSiteToolsConfig(undefined).config
    expect(resolveWebMcpConfig({ tools: false }, tools)).toEqual({
      _tag: 'Enabled',
      config: {
        exposedTo: undefined,
        tools: {},
      },
    })
  })
})
