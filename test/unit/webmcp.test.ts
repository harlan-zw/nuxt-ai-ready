import type { WebMcpModelContext, WebMcpTool, WebMcpToolResult } from '../../src/runtime/webmcp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkToolBudget, registerTool, truncateToolOutput, WEB_MCP_BUDGET } from '../../src/runtime/webmcp'
import { createSiteTools } from '../../src/runtime/webmcp-site-tools'

function toolByName(name: string): WebMcpTool {
  return createSiteTools().find(t => t.name === name)!
}

async function run(tool: WebMcpTool, input: Record<string, unknown>): Promise<WebMcpToolResult> {
  return await tool.execute(input) as WebMcpToolResult
}

function mockFetch(impl: (path: string, options?: any) => unknown) {
  const fetch = vi.fn(impl)
  ;(globalThis as any).$fetch = fetch
  return fetch
}

afterEach(() => {
  delete (globalThis as any).$fetch
})

describe('tool budget', () => {
  it('accepts a tool within budget', () => {
    expect(checkToolBudget({
      name: 'add_todo',
      description: 'Adds a to-do item.',
      inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'The item text.' } } },
      execute: () => '',
    })).toEqual([])
  })

  it('flags names, descriptions and param descriptions over budget', () => {
    const warnings = checkToolBudget({
      name: 'a'.repeat(WEB_MCP_BUDGET.name + 1),
      description: 'b'.repeat(WEB_MCP_BUDGET.description + 1),
      inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'c'.repeat(WEB_MCP_BUDGET.paramDescription + 1) } } },
      execute: () => '',
    })
    expect(warnings).toHaveLength(3)
    expect(warnings[2]).toContain('.text')
  })
})

describe('tool registration', () => {
  const tool: WebMcpTool = { name: 'noop', description: 'Does nothing.', execute: () => '' }

  function contextReturning(impl: () => unknown): WebMcpModelContext {
    return { registerTool: vi.fn(impl) } as unknown as WebMcpModelContext
  }

  it('tolerates a browser that returns nothing instead of a promise', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => registerTool(contextReturning(() => undefined), tool)).not.toThrow()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('reports a synchronous throw without breaking the caller', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const throwing = contextReturning(() => {
      throw new Error('bad exposedTo')
    })
    expect(() => registerTool(throwing, tool)).not.toThrow()
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
  })

  it('reports a rejected promise without an unhandled rejection', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerTool(contextReturning(() => Promise.reject(new Error('nope'))), tool)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
  })
})

describe('output truncation', () => {
  it('leaves output within budget untouched', () => {
    expect(truncateToolOutput('short', 100)).toBe('short')
  })

  it('truncates and points at the full source', () => {
    const result = truncateToolOutput('x'.repeat(50), 10, 'Read /about.md for the full page.')
    expect(result.startsWith('x'.repeat(10))).toBe(true)
    expect(result).toContain('Read /about.md for the full page.')
  })
})

describe('site tools', () => {
  it('registers read-only tools that stay within budget', () => {
    const tools = createSiteTools()
    expect(tools.map(t => t.name)).toEqual(['list_pages', 'search_pages', 'get_page_markdown'])
    for (const tool of tools) {
      expect(checkToolBudget(tool)).toEqual([])
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, untrustedContentHint: true })
    }
  })

  it('clamps list_pages paging to the endpoint limits', async () => {
    const fetch = mockFetch(() => ({ pages: [], total: 0 }))
    await run(toolByName('list_pages'), { limit: 500, offset: -5 })
    expect(fetch).toHaveBeenCalledWith('/__ai-ready/pages', { query: { limit: 50, offset: 0 } })
  })

  it('lists pages one per line with a position summary', async () => {
    mockFetch(() => ({
      pages: [
        { route: '/about', title: 'About', description: 'Who we are.' },
        { route: '/pricing', title: 'Pricing', description: 'What it costs.' },
      ],
      total: 7,
    }))
    const result = await run(toolByName('list_pages'), {})

    expect(result.content[0]!.text).toBe('Pages 1 to 2 of 7.\n/about | About | Who we are.\n/pricing | Pricing | What it costs.')
  })

  it('drops whole entries rather than cutting a line in half', async () => {
    mockFetch(() => ({
      pages: Array.from({ length: 20 }, (_, i) => ({ route: `/page-${i}`, title: `Page ${i}` })),
      total: 20,
    }))
    const tool = createSiteTools({ maxOutputChars: 80 }).find(t => t.name === 'list_pages')!
    const text = ((await tool.execute({})) as WebMcpToolResult).content[0]!.text

    expect(text).toContain('left out to fit')
    for (const line of text.split('\n').slice(1))
      expect(line).toMatch(/^\/page-\d+ \| Page \d+$/)
  })

  it('passes the search query through and honours searchLimit', async () => {
    const fetch = mockFetch(() => ({ results: [{ route: '/refunds', title: 'Refunds' }] }))
    const tool = createSiteTools({ searchLimit: 3 }).find(t => t.name === 'search_pages')!
    const result = await tool.execute({ query: '  refund policy  ' }) as WebMcpToolResult

    expect(fetch).toHaveBeenCalledWith('/__ai-ready/pages', { query: { q: 'refund policy', limit: 3 } })
    expect(result.content[0]!.text).toBe('1 result for "refund policy".\n/refunds | Refunds')
  })

  it('tells the agent what to try when a search finds nothing', async () => {
    mockFetch(() => ({ results: [] }))
    const result = await run(toolByName('search_pages'), { query: 'zzz' })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]!.text).toContain('list_pages')
  })

  it('returns a correctable error for an empty search', async () => {
    const result = await run(toolByName('search_pages'), { query: '  ' })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('query')
  })

  it.each(['about', '/about', '/about.md'])('normalizes %s before reading markdown', async (route) => {
    const fetch = mockFetch(() => '# About')
    await run(toolByName('get_page_markdown'), { route })
    expect(fetch).toHaveBeenCalledWith('/about.md', { responseType: 'text' })
  })

  it('rejects cross-origin routes', async () => {
    const fetch = mockFetch(() => '# Evil')
    const result = await run(toolByName('get_page_markdown'), { route: 'https://evil.example.com/x' })
    expect(fetch).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
  })

  it('tells the agent how to recover from a missing page', async () => {
    mockFetch(() => Promise.reject(new Error('404')))
    const result = await run(toolByName('get_page_markdown'), { route: '/missing' })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('search_pages')
  })

  it('falls back to the prerendered index when there is no server route', async () => {
    const fetch = mockFetch((path) => {
      if (path === '/__ai-ready/pages')
        throw new Error('404')
      return { pages: [{ route: '/about', title: 'About' }, { route: '/pricing', title: 'Pricing' }] }
    })
    const result = await run(toolByName('list_pages'), {})

    expect(fetch).toHaveBeenCalledWith('/__ai-ready/pages.json')
    expect(result.content[0]!.text).toBe('Pages 1 to 2 of 2.\n/about | About\n/pricing | Pricing')
  })

  it('falls back to the prerendered index when the runtime database is empty', async () => {
    mockFetch((path) => {
      if (path === '/__ai-ready/pages')
        return { pages: [], total: 0 }
      return { pages: [{ route: '/about', title: 'About' }] }
    })
    const result = await run(toolByName('list_pages'), {})

    expect(result.content[0]!.text).toContain('/about | About')
  })

  it('ranks the prerendered index in the browser when search has no server', async () => {
    mockFetch((path) => {
      if (path === '/__ai-ready/pages')
        throw new Error('404')
      return {
        pages: [
          { route: '/pricing', title: 'Pricing', description: 'Plans and costs.' },
          { route: '/about', title: 'About', description: 'Ask us about a refund.' },
          { route: '/refunds', title: 'Refund policy', description: 'How refunds work.' },
        ],
      }
    })
    const result = await run(toolByName('search_pages'), { query: 'refund' })
    const lines = result.content[0]!.text.split('\n')

    // /refunds scores on route, title and description; /about on description only
    expect(lines[0]).toBe('2 results for "refund".')
    expect(lines[1]).toContain('/refunds')
    expect(lines[2]).toContain('/about')
  })

  it('reports an empty site when neither source has pages', async () => {
    mockFetch(() => {
      throw new Error('404')
    })
    const result = await run(toolByName('list_pages'), {})

    expect(result.content[0]!.text).toBe('This site has no indexed pages yet.')
  })

  it('truncates page markdown to the configured budget', async () => {
    mockFetch(() => 'x'.repeat(5000))
    const tool = createSiteTools({ maxOutputChars: 100 }).find(t => t.name === 'get_page_markdown')!
    const result = await tool.execute({ route: '/long' }) as WebMcpToolResult
    expect(result.content[0]!.text).toContain('[Truncated at 100 characters. Read /long.md directly for the full page.]')
  })
})
