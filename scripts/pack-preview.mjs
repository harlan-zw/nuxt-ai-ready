import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const output = resolve(process.argv[2] || 'nuxt-ai-ready-preview.tgz')
const temporary = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-preview-'))

try {
  const packed = join(temporary, 'module.tgz')
  execFileSync('pnpm', ['pack', '--out', packed], { stdio: 'inherit' })
  execFileSync('tar', ['-xzf', packed, '-C', temporary])
  const stage = join(temporary, 'package')
  const manifestPath = join(stage, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.bundledDependencies = ['mdream', '@mdream/js']

  // npm keeps bundled packages inside the archive. Consumers can use the beta
  // before its registry release without allowing URL subdependencies.
  for (const name of manifest.bundledDependencies) {
    const source = await realpath(join('node_modules', name))
    const dependency = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
    manifest.dependencies[name] = dependency.version
    await mkdir(dirname(join(stage, 'node_modules', name)), { recursive: true })
    await cp(source, join(stage, 'node_modules', name), { recursive: true })
    const require = createRequire(join(source, 'package.json'))
    for (const child of Object.keys(dependency.dependencies || {})) {
      let childSource = dirname(require.resolve(child))
      while (!existsSync(join(childSource, 'package.json'))) {
        const parent = dirname(childSource)
        if (parent === childSource)
          throw new Error(`Cannot find package root for ${child}`)
        childSource = parent
      }
      await mkdir(dirname(join(stage, 'node_modules', child)), { recursive: true })
      await cp(childSource, join(stage, 'node_modules', child), { recursive: true })
    }
    if (Object.keys(dependency.optionalDependencies || {}).length)
      throw new Error(`${name} preview must include native files without optional dependencies`)
  }

  delete manifest.scripts
  delete manifest.devDependencies
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await mkdir(dirname(output), { recursive: true })
  execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', temporary], {
    cwd: stage,
    stdio: 'inherit',
  })
  await cp(join(temporary, `nuxt-ai-ready-${manifest.version}.tgz`), output)
  console.info(`Packed portable preview: ${output}`)
}
finally {
  await rm(temporary, { recursive: true, force: true })
}
