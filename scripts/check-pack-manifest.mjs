import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FORBIDDEN_SPECIFIER = /^(?:https?:|git(?:\+[^:]+)?:|github:|gitlab:|bitbucket:|file:|link:|workspace:|catalog:)/
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']

const tarball = process.argv[2]

if (!tarball) {
  console.error('Usage: node scripts/check-pack-manifest.mjs <packed-tarball>')
  process.exit(1)
}

const temporary = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-manifest-'))
try {
  execFileSync('tar', ['-xzf', tarball, '-C', temporary], { stdio: 'inherit' })
  const manifest = JSON.parse(await readFile(join(temporary, 'package', 'package.json'), 'utf8'))
  const violations = []
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (FORBIDDEN_SPECIFIER.test(spec))
        violations.push(`${name}: ${spec} (${field})`)
    }
  }
  if (violations.length) {
    console.error(`Packed manifest ${manifest.name}@${manifest.version} ships non-registry dependency specifiers:`)
    for (const violation of violations)
      console.error(`  ${violation}`)
    process.exitCode = 1
  }
  else {
    console.info(`Packed manifest ${manifest.name}@${manifest.version} uses registry specifiers only`)
  }
}
finally {
  await rm(temporary, { recursive: true, force: true })
}
