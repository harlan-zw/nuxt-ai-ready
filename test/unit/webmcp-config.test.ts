import { describe, expect, it } from 'vitest'
import { resolveWebMcpConfig } from '../../src/utils/webmcp'

describe('resolveWebMcpConfig', () => {
  it('keeps WebMCP disabled when no option is provided', () => {
    expect(resolveWebMcpConfig(undefined)).toEqual({ _tag: 'Disabled' })
  })

  it('resolves defaults for the boolean shorthand', () => {
    expect(resolveWebMcpConfig(true)).toEqual({
      _tag: 'Enabled',
      config: {
        exposedTo: undefined,
        maxOutputChars: 1500,
        searchLimit: 10,
        siteTools: ['list_pages', 'search_pages', 'get_page_markdown'],
      },
      warnings: [],
    })
  })

  it('preserves a selective built-in tool list', () => {
    expect(resolveWebMcpConfig({ siteTools: ['search_pages'] })).toMatchObject({
      _tag: 'Enabled',
      config: { siteTools: ['search_pages'] },
    })
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('replaces invalid output budget %s', (maxOutputChars) => {
    const result = resolveWebMcpConfig({ maxOutputChars })
    expect(result).toMatchObject({
      _tag: 'Enabled',
      config: { maxOutputChars: 1500 },
    })
    if (result._tag === 'Enabled')
      expect(result.warnings).toHaveLength(1)
  })

  it('clamps the search limit to the endpoint maximum', () => {
    const result = resolveWebMcpConfig({ searchLimit: 500 })
    expect(result).toMatchObject({
      _tag: 'Enabled',
      config: { searchLimit: 50 },
    })
    if (result._tag === 'Enabled')
      expect(result.warnings).toHaveLength(1)
  })
})
