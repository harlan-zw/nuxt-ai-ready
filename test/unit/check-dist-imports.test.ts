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
})
