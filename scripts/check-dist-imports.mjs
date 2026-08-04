import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'

const distDir = resolve(import.meta.dirname, '../dist')
const importPatterns = [
  /\bfrom\s+['"](\.[^'"]+)['"]/g,
  /\bimport\s*\(\s*['"](\.[^'"]+)['"]/g,
]

async function listPublishedFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory())
      return listPublishedFiles(path)
    return entry.isFile() && /(?:\.d\.ts|\.m?js)$/.test(entry.name) ? [path] : []
  }))
  return nested.flat()
}

async function exists(path) {
  return access(path).then(() => true).catch(error => error?.code === 'ENOENT' ? false : Promise.reject(error))
}

async function resolveRelativeImport(importer, specifier) {
  const base = resolve(dirname(importer), specifier)
  const candidates = extname(base)
    ? [base]
    : [base, `${base}.js`, `${base}.mjs`, resolve(base, 'index.js'), resolve(base, 'index.mjs')]
  const checks = await Promise.all(candidates.map(exists))
  return checks.some(Boolean)
}

const files = await listPublishedFiles(distDir)
const missing = (await Promise.all(files.map(async (file) => {
  const source = await readFile(file, 'utf8')
  const specifiers = importPatterns.flatMap(pattern => [...source.matchAll(pattern)].map(match => match[1]))
  const checks = await Promise.all(specifiers.map(async specifier => ({
    specifier,
    resolved: await resolveRelativeImport(file, specifier),
  })))
  return checks
    .filter(check => !check.resolved)
    .map(check => `${file.slice(distDir.length + 1)} -> ${check.specifier}`)
}))).flat()

if (missing.length) {
  throw new Error(`Published runtime has unresolved relative imports:\n${missing.map(item => `- ${item}`).join('\n')}`)
}

console.log(`Checked ${files.length} published files.`)
