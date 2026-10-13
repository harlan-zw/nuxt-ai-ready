import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { directoryToURL, tryResolveModule } from '@nuxt/kit'

const repoRoot = resolve(import.meta.dirname, '../..')
const repoModules = join(repoRoot, 'node_modules')

/**
 * `true` links the repository's `drizzle-orm`, `false` leaves it out, and
 * `{ version }` installs an empty package that reports that version.
 */
export type ConsumerDrizzle = boolean | { version: string }

export interface Consumer {
  rootDir: string
  remove: () => Promise<void>
}

async function linkModules(source: string, target: string, include: (name: string) => boolean): Promise<void> {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source)) {
    if (entry.startsWith('.') || !include(entry))
      continue
    if (entry.startsWith('@')) {
      await linkModules(join(source, entry), join(target, entry), () => true)
      continue
    }
    await symlink(join(source, entry), join(target, entry), 'junction')
  }
}

/**
 * Install the built module into a project outside this repository.
 *
 * The project links every repository dependency, and links `drizzle-orm` only
 * when `drizzle` is true. A `{ version }` value installs a stub instead. Resolution from the app root and from the installed
 * module then finds the ORM only when the app installs it. Inside the
 * repository, every lookup would find the development copy in the root
 * `node_modules`.
 */
export async function createConsumer(fixture: string, options: { drizzle: ConsumerDrizzle }): Promise<Consumer> {
  const manifest = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as { files: string[] }
  await access(join(repoRoot, 'dist/module.mjs')).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT')
      throw new Error('The consumer installs the built module. Run `pnpm dev:prepare` first.')
    throw error
  })

  const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-consumer-'))
  const remove = () => rm(rootDir, { recursive: true, force: true })
  if (!relative(repoRoot, rootDir).startsWith('..')) {
    await remove()
    throw new Error(`The temporary directory ${rootDir} is inside the repository. Set TMPDIR to a directory outside it.`)
  }

  await cp(join(repoRoot, 'test/fixtures', fixture), rootDir, { recursive: true })
  const modules = join(rootDir, 'node_modules')
  await linkModules(repoModules, modules, name => options.drizzle === true || name !== 'drizzle-orm')
  if (typeof options.drizzle === 'object') {
    const stub = join(modules, 'drizzle-orm')
    await mkdir(stub)
    await writeFile(join(stub, 'package.json'), JSON.stringify({ name: 'drizzle-orm', version: options.drizzle.version, type: 'module', exports: { '.': './index.js' } }))
    await writeFile(join(stub, 'index.js'), 'export {}\n')
  }
  const packageDir = join(modules, 'nuxt-ai-ready')
  for (const file of ['package.json', ...manifest.files])
    await cp(join(repoRoot, file), join(packageDir, file), { recursive: true })

  const drizzle = await tryResolveModule('drizzle-orm', directoryToURL(packageDir))
  const installed = options.drizzle !== false
  if (!!drizzle !== installed) {
    await remove()
    throw new Error(`Expected drizzle-orm to be ${installed ? 'installed' : 'absent'} in ${rootDir}, but it resolved to ${drizzle}.`)
  }
  return { rootDir, remove }
}
