import type { MdreamOptions } from 'mdream'
import type { MarkdownContext } from '../../src/runtime/types'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const config = {
  runtimeSync: { enabled: true, ttl: 0, batchSize: 10 },
  mdreamOptions: {},
  database: { filename: '' },
}

const contexts: MarkdownContext[] = []
const handlers: Record<string, (payload: any) => void> = {
  'ai-ready:mdreamConfig': (options: MdreamOptions) => {
    options.filter ||= {}
    options.filter.exclude = [...(options.filter.exclude || []), 'ul']
  },
  'ai-ready:page:markdown': (ctx: MarkdownContext) => {
    contexts.push(ctx)
    ctx.markdown += '\n\nNitro hook ran.'
  },
}
const hooks = { callHook: async (name: string, payload: unknown) => handlers[name]?.(payload) }

vi.mock('#nuxtseo/nitro', () => ({
  useEvent: () => {
    throw new Error('No active event')
  },
  useNitroApp: () => ({ hooks }),
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': config, 'site': { url: 'https://example.com' } }),
}))

vi.mock('../../src/runtime/server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() },
}))

const { indexPage } = await import('../../src/runtime/server/utils/indexPage')

const html = '<!DOCTYPE html><html><head><title>About</title></head><body><h1>About</h1><p>Welcome.</p><ul><li>Hidden item</li></ul></body></html>'

describe('indexPage', () => {
  beforeAll(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-index-hooks-'))
    config.database.filename = join(directory, 'pages.db')
  })

  it('stores the Markdown the Nitro conversion hooks produce', async () => {
    const result = await indexPage('/about', html, { force: true, skipHook: true })

    expect(result.success).toBe(true)
    expect(result.data?.markdown).toContain('Nitro hook ran.')
    expect(result.data?.markdown).not.toContain('Hidden item')
    expect(contexts.at(-1)).toMatchObject({ route: '/about', isPrerender: false })
  })
})
