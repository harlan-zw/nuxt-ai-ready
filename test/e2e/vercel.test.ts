import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const fixtureDir = resolve('../fixtures/vercel')

function getOutputDir() {
  const ctx = useTestContext()
  // test-utils outputs to nuxt.options.buildDir + /output/ instead of .vercel/output/
  const buildDir = ctx.nuxt?.options.buildDir
  if (!buildDir) {
    throw new Error('nuxt.options.buildDir not available in test context')
  }
  return join(buildDir, 'output')
}

async function readConfig() {
  return JSON.parse(await readFile(join(getOutputDir(), 'config.json'), 'utf-8'))
}

describe('vercel build output', async () => {
  await setup({
    server: false,
    build: true,
    fixture: fixtureDir,
    nuxtConfig: {
      // Must be >= 2025-07-15 and set here: nitro's vercel preset only emits
      // per-handler function routes (the #825 trigger) past that compat date,
      // and test-utils' own '2024-04-03' default overrides the fixture config.
      compatibilityDate: '2025-10-15',
    },
  })

  it('emits llms.txt and llms-full.txt as static assets', async () => {
    for (const file of ['llms.txt', 'llms-full.txt']) {
      await expect(access(join(getOutputDir(), 'static', file))).resolves.toBeUndefined()
    }
  })

  // Regression test for nuxt/scripts#825: the runtime /llms-full.txt handler
  // became a dedicated Vercel function, and on Vercel a function output shadows
  // a static file with the same path. Production served the handler's database
  // error instead of the build-generated file. Streaming llms-full.txt must
  // register it as a prerendered route so the preset drops the function route,
  // the same way prerenderRoute() already handles /llms.txt.
  it('does not route llms txt files to serverless functions (#825)', async () => {
    const config = await readConfig()
    const functionRoutes = (config.routes as any[]).filter(r =>
      r.dest && ['/llms.txt', '/llms-full.txt'].includes(r.src))
    expect(functionRoutes).toEqual([])

    const functions = await readdir(join(getOutputDir(), 'functions'))
    expect(functions).not.toContain('llms.txt.func')
    expect(functions).not.toContain('llms-full.txt.func')
  })

  // The overrides map is keyed by static-dir-relative file paths. prerenderRoute()
  // used to register an absolute fileName, producing keys like
  // "home/user/app/.vercel/output/static/llms.txt" and a Vercel deploy warning
  // ("Override path ... was not detected as an output path").
  it('only emits overrides for files that exist in the static output', async () => {
    const config = await readConfig()
    for (const key of Object.keys(config.overrides ?? {})) {
      await expect(access(join(getOutputDir(), 'static', key)), `override key "${key}"`).resolves.toBeUndefined()
    }
  })
})
