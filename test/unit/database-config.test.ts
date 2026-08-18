import type { DatabaseInput, ResolveDatabaseInput } from '../../src/utils/database'
import { describe, expect, it } from 'vitest'
import { resolveDatabaseConfig } from '../../src/utils/database'
import { resolveSiteToolsConfig, resolveWebMcpConfig } from '../../src/utils/webmcp'

function input(overrides: Partial<ResolveDatabaseInput> = {}): ResolveDatabaseInput {
  return {
    database: undefined,
    rootDir: '/app',
    preset: '',
    hasPostgresUrl: false,
    requested: { runtimeSync: false, cron: false, indexNow: false },
    ...overrides,
  }
}

function resolveDatabase(database: DatabaseInput | undefined, overrides: Partial<ResolveDatabaseInput> = {}) {
  const result = resolveDatabaseConfig(input({ database, ...overrides }))
  if (result._tag !== 'Resolved')
    throw new Error(`expected a resolved database, got: ${result.message}`)
  return result.database
}

describe('resolveDatabaseConfig', () => {
  it('defaults to sqlite with an absolute filename', () => {
    expect(resolveDatabase(undefined)).toEqual({
      _tag: 'Enabled',
      type: 'sqlite',
      filename: '/app/.data/ai-ready/pages.db',
    })
  })

  it('keeps an absolute filename as given', () => {
    expect(resolveDatabase({ filename: '/var/data/pages.db' })).toEqual({
      _tag: 'Enabled',
      type: 'sqlite',
      filename: '/var/data/pages.db',
    })
  })

  it('picks D1 for a Cloudflare preset', () => {
    expect(resolveDatabase(undefined, { preset: 'cloudflare_module' })).toEqual({
      _tag: 'Enabled',
      type: 'd1',
      bindingName: 'DB',
    })
  })

  it('picks Neon for Vercel with a Postgres URL', () => {
    expect(resolveDatabase(undefined, { preset: 'vercel', hasPostgresUrl: true })).toEqual({
      _tag: 'Enabled',
      type: 'neon',
      url: undefined,
    })
  })

  it('warns about Vercel Edge without a Postgres URL', () => {
    const result = resolveDatabaseConfig(input({ preset: 'vercel-edge' }))
    expect(result._tag).toBe('Resolved')
    expect(result._tag === 'Resolved' && result.logs.some(log => log.level === 'warn')).toBe(true)
  })

  it('honours an explicit type over the preset', () => {
    expect(resolveDatabase({ type: 'libsql', url: 'libsql://db', authToken: 'token' }, { preset: 'cloudflare' })).toEqual({
      _tag: 'Enabled',
      type: 'libsql',
      url: 'libsql://db',
      authToken: 'token',
    })
  })

  it('disables the database for false', () => {
    expect(resolveDatabase(false)).toEqual({ _tag: 'Disabled' })
  })

  it('disables the database for the none type', () => {
    expect(resolveDatabase({ type: 'none' })).toEqual({ _tag: 'Disabled' })
  })

  it('drops the driver settings when disabled', () => {
    expect(resolveDatabase({ type: 'none', filename: 'pages.db', url: 'libsql://db' })).toEqual({ _tag: 'Disabled' })
  })

  it('ignores the preset when disabled', () => {
    expect(resolveDatabase(false, { preset: 'cloudflare_module' })).toEqual({ _tag: 'Disabled' })
  })

  it('rejects a disabled database with runtimeSync', () => {
    const result = resolveDatabaseConfig(input({
      database: false,
      requested: { runtimeSync: true, cron: false, indexNow: false },
    }))
    expect(result._tag).toBe('Invalid')
    expect(result._tag === 'Invalid' && result.conflicts).toEqual(['runtimeSync'])
    expect(result._tag === 'Invalid' && result.message).toContain('aiReady.runtimeSync')
  })

  it('reports every conflicting option at once', () => {
    const result = resolveDatabaseConfig(input({
      database: { type: 'none' },
      requested: { runtimeSync: true, cron: true, indexNow: true },
    }))
    expect(result._tag === 'Invalid' && result.conflicts).toEqual(['runtimeSync', 'cron', 'indexNow'])
  })

  it('allows those options when the database is enabled', () => {
    const result = resolveDatabaseConfig(input({
      requested: { runtimeSync: true, cron: true, indexNow: true },
    }))
    expect(result._tag).toBe('Resolved')
  })
})

describe('site tools with a disabled database', () => {
  it('detaches every site tool from MCP', () => {
    const { config } = resolveSiteToolsConfig(undefined, { database: { _tag: 'Disabled' } })
    expect([config.listPages.mcp.enabled, config.searchPages.mcp.enabled, config.getPageMarkdown.mcp.enabled])
      .toEqual([false, false, false])
  })

  it('detaches every site tool from WebMCP even when requested', () => {
    const { config } = resolveSiteToolsConfig(
      { listPages: { webmcp: { enabled: true } } },
      { database: { _tag: 'Disabled' } },
    )
    expect(resolveWebMcpConfig(true, config)).toEqual({ _tag: 'Enabled', config: { tools: {}, exposedTo: undefined } })
  })

  it('keeps site tools attached when the database is enabled', () => {
    const { config } = resolveSiteToolsConfig(undefined, {
      database: { _tag: 'Enabled', type: 'sqlite', filename: '/app/pages.db' },
    })
    expect(config.listPages.mcp.enabled).toBe(true)
  })
})
