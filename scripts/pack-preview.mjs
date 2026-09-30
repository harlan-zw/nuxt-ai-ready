import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const output = resolve(process.argv[2] || 'nuxt-ai-ready-preview.tgz')
const temporary = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-preview-'))

const LOCAL_BINARY = /require\('\.\/rust\.([a-z0-9-]+)\.node'\)/g
const WASI_LOADER = /require\('\.\/rust\.wasi\.cjs'\)/
const WASI_PACKAGE = '@mdream/rust-wasm32-wasi'
const WASI_FILES = ['rust.wasi.cjs', 'rust.wasm32-wasi.wasm', 'rust.wasm32-wasi.debug.wasm']

// The mdream beta snapshot only ships linux glibc binaries inline. Its loader
// also tries rust.<platform>.node files next to napi/index.mjs, so this pulls
// every published platform binary and the WASI fallback into the staged copy.
function registryVersion(name) {
  try {
    return execFileSync('npm', ['view', name, 'version'], { encoding: 'utf8' }).trim()
  }
  catch {
    // Unpublished napi target (e.g. win32-x64-gnu). Nothing to bundle; the
    // WASI fallback covers the platform at runtime.
    return null
  }
}

async function downloadPackage(name, version, destination) {
  const stdout = execFileSync('npm', ['pack', `${name}@${version}`, '--pack-destination', destination, '--json'], { encoding: 'utf8' })
  const parsed = JSON.parse(stdout)
  const entry = Array.isArray(parsed) ? parsed.at(-1) : Object.values(parsed).at(-1)
  const extract = join(destination, `${name.replace(/[@/]/g, '-')}-${version}`)
  await mkdir(extract, { recursive: true })
  execFileSync('tar', ['-xzf', join(destination, entry.filename), '-C', extract], { stdio: 'inherit' })
  return join(extract, 'package')
}

async function vendorInlineBinary(napiDirectory, platform, downloads) {
  const binary = `rust.${platform}.node`
  if (existsSync(join(napiDirectory, binary)))
    return
  const name = `@mdream/rust-${platform}`
  const version = registryVersion(name)
  if (!version) {
    console.info(`No npm package for ${name}; the WASI fallback covers this platform`)
    return
  }
  const source = await downloadPackage(name, version, downloads)
  const { main } = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  await cp(join(source, main), join(napiDirectory, binary))
  console.info(`Bundled ${name}@${version} as napi/${binary}`)
}

async function vendorWasiFallback(napiDirectory, downloads) {
  if (existsSync(join(napiDirectory, 'rust.wasi.cjs')))
    return
  const version = registryVersion(WASI_PACKAGE)
  if (!version)
    throw new Error(`Cannot bundle the universal WASI fallback: ${WASI_PACKAGE} not found on npm`)
  const source = await downloadPackage(WASI_PACKAGE, version, downloads)
  for (const file of WASI_FILES) {
    if (existsSync(join(source, file)))
      await cp(join(source, file), join(napiDirectory, file))
  }
  if (existsSync(join(source, 'node_modules')))
    await cp(join(source, 'node_modules'), join(napiDirectory, 'node_modules'), { recursive: true })
  console.info(`Bundled ${WASI_PACKAGE}@${version} as the universal WASI fallback`)
}

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

  const napiDirectory = join(stage, 'node_modules', 'mdream', 'napi')
  const glue = await readFile(join(napiDirectory, 'index.mjs'), 'utf8')
  const downloads = join(temporary, 'downloads')
  await mkdir(downloads, { recursive: true })
  const referencedPlatforms = [...new Set([...glue.matchAll(LOCAL_BINARY)].map(match => match[1]))]
  for (const platform of referencedPlatforms)
    await vendorInlineBinary(napiDirectory, platform, downloads)
  if (WASI_LOADER.test(glue))
    await vendorWasiFallback(napiDirectory, downloads)

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
