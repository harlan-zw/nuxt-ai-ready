import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = resolve(import.meta.dirname, '../../scripts/check-dist-imports.mjs')
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('published import closure', () => {
  it('rejects missing imports, unpublished source escapes, and broken declarations', async () => {
    const packageRoot = await mkdtemp(resolve(tmpdir(), 'nuxt-ai-ready-dist-check-'))
    temporaryDirectories.push(packageRoot)
    await Promise.all([
      mkdir(resolve(packageRoot, 'dist'), { recursive: true }),
      mkdir(resolve(packageRoot, 'src'), { recursive: true }),
    ])
    await Promise.all([
      writeFile(resolve(packageRoot, 'package.json'), JSON.stringify({ files: ['dist'] })),
      writeFile(resolve(packageRoot, 'src/source-only.mjs'), 'export const sourceOnly = true\n'),
      writeFile(resolve(packageRoot, 'dist/index.mjs'), [
        `import '../src/source-only.mjs'`,
        `import './missing-side-effect.mjs'`,
        `export { missing } from './missing-export.mjs'`,
        `void import('./missing-dynamic.mjs')`,
        `void require('./missing-require.cjs')`,
      ].join('\n')),
      writeFile(resolve(packageRoot, 'dist/types.d.mts'), `export type { Missing } from './missing-types.mjs'\n`),
    ])

    const result = await execa(process.execPath, [scriptPath, packageRoot], { reject: false })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('dist/index.mjs -> ../src/source-only.mjs')
    expect(result.stderr).toContain('dist/index.mjs -> ./missing-side-effect.mjs')
    expect(result.stderr).toContain('dist/index.mjs -> ./missing-export.mjs')
    expect(result.stderr).toContain('dist/index.mjs -> ./missing-dynamic.mjs')
    expect(result.stderr).toContain('dist/index.mjs -> ./missing-require.cjs')
    expect(result.stderr).toContain('dist/types.d.mts -> ./missing-types.mjs')
  })

  it('rejects runtime imports that bypass Nitro compatibility aliases', async () => {
    const packageRoot = await mkdtemp(resolve(tmpdir(), 'nuxt-ai-ready-dist-check-'))
    temporaryDirectories.push(packageRoot)
    await mkdir(resolve(packageRoot, 'dist/runtime/server'), { recursive: true })
    await Promise.all([
      writeFile(resolve(packageRoot, 'package.json'), JSON.stringify({ files: ['dist'] })),
      writeFile(resolve(packageRoot, 'dist/runtime/server/index.mjs'), [
        `import { eventHandler } from 'h3'`,
        `import { useRuntimeConfig } from 'nitropack/runtime'`,
        `import { resolveI18nConfig } from 'nuxtseo-shared/i18n'`,
      ].join('\n')),
    ])

    const result = await execa(process.execPath, [scriptPath, packageRoot], { reject: false })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('dist/runtime/server/index.mjs -> h3')
    expect(result.stderr).toContain('dist/runtime/server/index.mjs -> nitropack/runtime')
    expect(result.stderr).toContain('dist/runtime/server/index.mjs -> nuxtseo-shared/i18n')
  })
  it('rejects required module dependencies that a consumer install does not provide', async () => {
    const packageRoot = await mkdtemp(resolve(tmpdir(), 'nuxt-ai-ready-dist-check-'))
    temporaryDirectories.push(packageRoot)
    await mkdir(resolve(packageRoot, 'dist'), { recursive: true })
    await Promise.all([
      writeFile(resolve(packageRoot, 'package.json'), JSON.stringify({
        files: ['dist'],
        main: './dist/module.mjs',
        dependencies: { 'nuxt-site-config': '^4.0.0' },
        peerDependencies: { '@nuxtjs/sitemap': '>=8.3.1' },
        devDependencies: { '@nuxtjs/robots': '^6.0.0' },
      })),
      writeFile(resolve(packageRoot, 'dist/module.mjs'), [
        'const moduleDependencies = {',
        `  'nuxt-site-config': { version: '>=3.2' },`,
        `  '@nuxtjs/sitemap': { version: '>=8.3.0' },`,
        `  '@nuxtjs/robots': { version: '>=6.0.0' },`,
        `  '@nuxtjs/mcp-toolkit': { version: '>=0.18.0', optional: true },`,
        '}',
        'export default Object.assign(() => {}, { getModuleDependencies: () => moduleDependencies })',
      ].join('\n')),
    ])

    const result = await execa(process.execPath, [scriptPath, packageRoot], { reject: false })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('- @nuxtjs/robots')
    expect(result.stderr).toContain('- @nuxtjs/sitemap')
    expect(result.stderr).not.toContain('- nuxt-site-config')
    expect(result.stderr).not.toContain('- @nuxtjs/mcp-toolkit')
  })
})
