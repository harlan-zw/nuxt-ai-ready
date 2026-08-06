import { describe, expect, it } from 'vitest'
import { resolveModuleEntryUrl } from '../../src/module-resolver'

describe('module resolver', () => {
  it('preserves source and unsplit module entry URLs', () => {
    expect(resolveModuleEntryUrl('file:///project/src/module.ts')).toBe('file:///project/src/module.ts')
    expect(resolveModuleEntryUrl('file:///project/dist/module.mjs')).toBe('file:///project/dist/module.mjs')
  })

  it('anchors split implementation chunks to the public module entry', () => {
    expect(resolveModuleEntryUrl('file:///project/dist/shared/nuxt-ai-ready.hash.mjs'))
      .toBe('file:///project/dist/module.mjs')
  })
})
