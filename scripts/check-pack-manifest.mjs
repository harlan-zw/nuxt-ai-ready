import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FORBIDDEN_SPECIFIER = /^(?:https?:|git(?:\+[^:]+)?:|github:|gitlab:|bitbucket:|file:|link:|workspace:|catalog:)/
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']
const LOCAL_BINARY = /require\('\.\/rust\.([a-z0-9-]+)\.node'\)/g
const WASI_LOADER = /require\('\.\/rust\.wasi\.cjs'\)/
const WASI_ARTIFACTS = ['rust.wasm32-wasi.wasm', 'rust.wasm32-wasi.debug.wasm']
const SUPPORTED_PLATFORMS = [
  'darwin-x64',
  'darwin-arm64',
  'win32-x64-msvc',
  'linux-x64-musl',
  'linux-arm64-musl',
]

const tarball = process.argv[2]

if (!tarball) {
  console.error('Usage: node scripts/check-pack-manifest.mjs <packed-tarball>')
  process.exit(1)
}

function platformPackageProvidesBinding(root, platform) {
  return existsSync(join(root, 'package.json')) && existsSync(join(root, `rust.${platform}.node`))
}

const temporary = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-manifest-'))
try {
  execFileSync('tar', ['-xzf', tarball, '-C', temporary], { stdio: 'inherit' })
  const manifest = JSON.parse(await readFile(join(temporary, 'package', 'package.json'), 'utf8'))
  const specifierViolations = []
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (FORBIDDEN_SPECIFIER.test(spec))
        specifierViolations.push(`${name}: ${spec} (${field})`)
    }
  }
  if (specifierViolations.length) {
    console.error(`Packed manifest ${manifest.name}@${manifest.version} ships non-registry dependency specifiers:`)
    for (const violation of specifierViolations)
      console.error(`  ${violation}`)
  }
  else {
    console.info(`Packed manifest ${manifest.name}@${manifest.version} uses registry specifiers only`)
  }

  const bindingViolations = []
  const mdreamRoot = join(temporary, 'package', 'node_modules', 'mdream')
  const gluePath = join(mdreamRoot, 'napi', 'index.mjs')
  if (existsSync(gluePath)) {
    const glue = await readFile(gluePath, 'utf8')
    const referenced = new Set([...glue.matchAll(LOCAL_BINARY)].map(match => match[1]))
    for (const platform of SUPPORTED_PLATFORMS) {
      if (!referenced.has(platform))
        continue
      if (existsSync(join(mdreamRoot, 'napi', `rust.${platform}.node`)))
        continue
      if (platformPackageProvidesBinding(join(mdreamRoot, 'node_modules', '@mdream', `rust-${platform}`), platform))
        continue
      bindingViolations.push(`rust.${platform}.node missing (${platform})`)
    }
    if (WASI_LOADER.test(glue)) {
      const hasWasiLoader = existsSync(join(mdreamRoot, 'napi', 'rust.wasi.cjs'))
      const hasWasiArtifact = WASI_ARTIFACTS.some(artifact => existsSync(join(mdreamRoot, 'napi', artifact)))
      if (!hasWasiLoader || !hasWasiArtifact)
        bindingViolations.push('universal WASI fallback missing (rust.wasi.cjs + rust.wasm32-wasi.wasm)')
    }
    if (bindingViolations.length) {
      console.error(`Bundled mdream cannot load its native parser on every supported platform:`)
      for (const violation of bindingViolations)
        console.error(`  ${violation}`)
      console.error('Consumers on macOS, Windows, or musl Linux fail at import.')
    }
    else {
      console.info(`Bundled mdream ships native bindings for: ${SUPPORTED_PLATFORMS.join(', ')}`)
    }
  }

  if (specifierViolations.length || bindingViolations.length)
    process.exitCode = 1
  else
    console.info(`Packed archive ${manifest.name}@${manifest.version} is portable`)
}
finally {
  await rm(temporary, { recursive: true, force: true })
}
