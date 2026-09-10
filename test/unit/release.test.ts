import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, resolve } from 'node:path'
import { execa } from 'execa'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const { scripts: { release } } = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
let directory: string

async function git(...args: string[]) {
  return execa('git', args, { cwd: directory })
}

async function runRelease(buildDirty = false) {
  return execa('sh', ['-c', release], {
    cwd: directory,
    env: {
      PATH: `${resolve(directory, '.cache/bin')}${delimiter}${process.env.PATH}`,
      BUILD_DIRTY: buildDirty ? '1' : '0',
    },
    reject: false,
  })
}

beforeEach(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'nuxt-ai-ready-release-'))
  await mkdir(resolve(directory, '.cache/bin'), { recursive: true })
  await cp(resolve(repositoryRoot, 'scripts'), resolve(directory, 'scripts'), { recursive: true })
  await writeFile(resolve(directory, '.gitignore'), '.cache/\n')
  await writeFile(resolve(directory, 'tracked.txt'), 'original\n')
  await writeFile(resolve(directory, '.cache/events'), '')
  await writeFile(resolve(directory, '.cache/bin/pnpm'), `#!/bin/sh
echo build >> .cache/events
if [ "$BUILD_DIRTY" = 1 ]; then echo changed > tracked.txt; fi
`, { mode: 0o755 })
  await writeFile(resolve(directory, '.cache/bin/bumpp'), '#!/bin/sh\necho bump >> .cache/events\n', { mode: 0o755 })
  await git('init', '--quiet')
  await git('config', 'core.hooksPath', resolve(directory, '.cache/hooks'))
  await git('config', 'user.name', 'Release Test')
  await git('config', 'user.email', 'release@example.test')
  await git('config', 'commit.gpgsign', 'false')
  await git('add', '.')
  await git('commit', '--quiet', '-m', 'test: create release fixture')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('release', () => {
  it.each(['unstaged', 'staged', 'untracked', 'deleted', 'hidden untracked'])('blocks %s changes before building', async (state) => {
    if (state === 'deleted') {
      await rm(resolve(directory, 'tracked.txt'))
    }
    else {
      const path = state.includes('untracked') ? 'new.txt' : 'tracked.txt'
      await writeFile(resolve(directory, path), 'changed\n')
    }
    if (state === 'staged')
      await git('add', 'tracked.txt')
    if (state === 'hidden untracked')
      await git('config', 'status.showUntrackedFiles', 'no')

    const result = await runRelease()

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Commit or stash your changes before releasing.')
    expect(await readFile(resolve(directory, '.cache/events'), 'utf8')).toBe('')
  })

  it('allows a clean checkout with ignored build files', async () => {
    const result = await runRelease()

    expect(result.exitCode).toBe(0)
    expect(await readFile(resolve(directory, '.cache/events'), 'utf8')).toBe('build\nbump\n')
  })

  it('blocks the version bump if the build changes tracked files', async () => {
    const result = await runRelease(true)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Commit or stash your changes before releasing.')
    expect(await readFile(resolve(directory, '.cache/events'), 'utf8')).toBe('build\n')
  })

  it('blocks the release if Git cannot read the repository', async () => {
    await rm(resolve(directory, '.git'), { recursive: true })

    const result = await runRelease()

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('not a git repository')
    expect(await readFile(resolve(directory, '.cache/events'), 'utf8')).toBe('')
  })
})
