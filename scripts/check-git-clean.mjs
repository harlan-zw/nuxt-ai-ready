import { execFileSync } from 'node:child_process'

const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'], {
  encoding: 'utf8',
})

if (status.length > 0) {
  console.error('Release blocked: Git has uncommitted changes. Commit or stash your changes before releasing.')
  console.error(status.trimEnd())
  process.exit(1)
}
