import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FORBIDDEN_SPECIFIER = /^(?:https?:|git(?:\+[^:]+)?:|github:|gitlab:|bitbucket:|file:|link:|workspace:|catalog:)/
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']
const BUNDLE_FIELDS = ['bundledDependencies', 'bundleDependencies']
const VENDORED_PACKAGE = /(?:^|\/)(node_modules\/(?:@[^/]+\/)?[^/]+)/

const tarball = process.argv[2]

if (!tarball) {
  console.error('Usage: node scripts/check-pack-manifest.mjs <packed-tarball>')
  process.exit(1)
}

const temporary = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-manifest-'))
try {
  execFileSync('tar', ['-xzf', tarball, '-C', temporary], { stdio: 'inherit' })
  const manifest = JSON.parse(await readFile(join(temporary, 'package', 'package.json'), 'utf8'))
  const label = `${manifest.name}@${manifest.version}`
  const violations = []

  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (FORBIDDEN_SPECIFIER.test(spec))
        violations.push(`non-registry specifier ${name}: ${spec} (${field})`)
    }
  }

  for (const field of BUNDLE_FIELDS) {
    const bundled = manifest[field]
    if (bundled === true || (Array.isArray(bundled) && bundled.length))
      violations.push(`${field}: ${bundled === true ? 'true' : bundled.join(', ')}`)
  }

  const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split('\n').filter(Boolean)
  const vendored = new Set(entries.map(entry => VENDORED_PACKAGE.exec(entry)?.[1]).filter(Boolean))
  for (const path of vendored)
    violations.push(`vendored package ${path}`)

  if (violations.length) {
    console.error(`Packed archive ${label} must install every dependency from the registry:`)
    for (const violation of violations)
      console.error(`  ${violation}`)
    process.exitCode = 1
  }
  else {
    console.info(`Packed archive ${label} uses registry dependencies only and vendors no node_modules`)
  }
}
finally {
  await rm(temporary, { recursive: true, force: true })
}
