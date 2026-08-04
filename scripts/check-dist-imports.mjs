import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'

const importPatterns = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
]
const declarationSourcePattern = /\.d\.[cm]?ts$/
const publishedSourcePattern = /(?:\.d\.[cm]?ts|\.[cm]?js)$/
const publishedServerRuntimePattern = /^dist\/runtime\/server\/.*\.[cm]?js$/
const incompatibleRuntimeImports = new Set(['h3', 'nitropack/runtime'])

function parsePublishedPaths(packageJson) {
  if (!packageJson || typeof packageJson !== 'object' || !Array.isArray(packageJson.files))
    throw new TypeError('package.json must define a files array.')
  if (!packageJson.files.every(path => typeof path === 'string' && path.length > 0))
    throw new TypeError('package.json files entries must be non-empty strings.')
  return packageJson.files
}

async function listFiles(path) {
  const entry = await stat(path)
  if (entry.isFile())
    return [path]
  if (!entry.isDirectory())
    return []

  const children = await readdir(path)
  return (await Promise.all(children.map(child => listFiles(resolve(path, child))))).flat()
}

function toPackagePath(packageRoot, path) {
  return relative(packageRoot, path).split(sep).join('/')
}

function declarationCandidates(base, extension) {
  if (!['.js', '.mjs', '.cjs'].includes(extension))
    return []
  const stem = base.slice(0, -extension.length)
  return [`${stem}.d.ts`, `${stem}.d.mts`, `${stem}.d.cts`]
}

function importCandidates(importer, specifier) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0]
  const base = resolve(dirname(importer), cleanSpecifier)
  const extension = extname(base)
  if (extension) {
    return [
      base,
      ...(declarationSourcePattern.test(importer)
        ? declarationCandidates(base, extension)
        : []),
    ]
  }

  const extensions = ['.js', '.mjs', '.cjs', '.d.ts', '.d.mts', '.d.cts']
  return [
    base,
    ...extensions.map(suffix => `${base}${suffix}`),
    ...extensions.map(suffix => resolve(base, `index${suffix}`)),
  ]
}

function extractRelativeImports(source) {
  return extractImports(source).filter(specifier => specifier.startsWith('.'))
}

function extractImports(source) {
  return [...new Set(importPatterns.flatMap(pattern => [...source.matchAll(pattern)].map(match => match[1])))]
}

async function findMissingRelativeImports(packageRoot) {
  const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
  const publishedPaths = parsePublishedPaths(packageJson)
  const publishedFiles = (await Promise.all(publishedPaths.map(path => listFiles(resolve(packageRoot, path))))).flat()
  const publishedFileSet = new Set(publishedFiles.map(path => toPackagePath(packageRoot, path)))
  const sourceFiles = publishedFiles.filter(path => publishedSourcePattern.test(path))

  return (await Promise.all(sourceFiles.map(async (file) => {
    const source = await readFile(file, 'utf8')
    const missing = extractRelativeImports(source).filter(specifier =>
      !importCandidates(file, specifier).some(candidate => publishedFileSet.has(toPackagePath(packageRoot, candidate))),
    )
    return missing.map(specifier => `${toPackagePath(packageRoot, file)} -> ${specifier}`)
  }))).flat()
}

async function findIncompatibleRuntimeImports(packageRoot) {
  const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
  const publishedPaths = parsePublishedPaths(packageJson)
  const publishedFiles = (await Promise.all(publishedPaths.map(path => listFiles(resolve(packageRoot, path))))).flat()
  const runtimeFiles = publishedFiles.filter(path => publishedServerRuntimePattern.test(toPackagePath(packageRoot, path)))

  return (await Promise.all(runtimeFiles.map(async (file) => {
    const source = await readFile(file, 'utf8')
    return extractImports(source)
      .filter(specifier => incompatibleRuntimeImports.has(specifier))
      .map(specifier => `${toPackagePath(packageRoot, file)} -> ${specifier}`)
  }))).flat()
}

const packageRoot = resolve(process.argv[2] || import.meta.dirname, process.argv[2] ? '.' : '..')
const [missing, incompatible] = await Promise.all([
  findMissingRelativeImports(packageRoot),
  findIncompatibleRuntimeImports(packageRoot),
])

const failures = [
  ...(missing.length ? [`Published package has unresolved relative imports:\n${missing.map(item => `- ${item}`).join('\n')}`] : []),
  ...(incompatible.length ? [`Published server runtime bypasses Nitro compatibility aliases:\n${incompatible.map(item => `- ${item}`).join('\n')}`] : []),
]
if (failures.length)
  throw new Error(failures.join('\n'))

console.log(`Checked published import closure for ${packageRoot}.`)
