import { describe, expect, it } from 'vitest'
import { checkDrizzleInstall, formatDrizzleMessage, matchCaretRange } from '../../src/utils/database'

const requested = { runtimeSync: true, cron: false, mcp: false, webmcp: false }

describe('matchCaretRange', () => {
  it.each([
    ['1.0.0-rc.4', 'Satisfied'],
    ['1.0.0-rc.10', 'Satisfied'],
    ['1.0.0', 'Satisfied'],
    ['1.7.2', 'Satisfied'],
    ['0.45.2', 'Unsatisfied'],
    ['1.0.0-rc.3', 'Unsatisfied'],
    ['1.0.0-beta.9', 'Unsatisfied'],
    ['1.1.0-beta.1', 'Unsatisfied'],
    ['2.0.0', 'Unsatisfied'],
    ['2.0.0-rc.1', 'Unsatisfied'],
  ])('%s against ^1.0.0-rc.4 is %s', (version, tag) => {
    expect(matchCaretRange(version, '^1.0.0-rc.4')._tag).toBe(tag)
  })

  it('bounds a zero major by its minor', () => {
    expect(matchCaretRange('0.45.9', '^0.45.2')._tag).toBe('Satisfied')
    expect(matchCaretRange('0.46.0', '^0.45.2')._tag).toBe('Unsatisfied')
  })

  it('does not judge a range it cannot parse', () => {
    expect(matchCaretRange('0.45.2', '>=1.0.0')._tag).toBe('Unparsed')
    expect(matchCaretRange('workspace', '^1.0.0')._tag).toBe('Unparsed')
  })
})

describe('checkDrizzleInstall', () => {
  it('reports a missing package', () => {
    expect(checkDrizzleInstall({ _tag: 'Missing' }, '^1.0.0-rc.4')).toEqual({ _tag: 'Missing' })
  })

  it('reports a version outside the peer range', () => {
    expect(checkDrizzleInstall({ _tag: 'Installed', version: '0.45.2' }, '^1.0.0-rc.4'))
      .toEqual({ _tag: 'OutOfRange', version: '0.45.2' })
  })

  it('accepts a version in the peer range or one it cannot read', () => {
    expect(checkDrizzleInstall({ _tag: 'Installed', version: '1.0.0-rc.4' }, '^1.0.0-rc.4')).toBeUndefined()
    expect(checkDrizzleInstall({ _tag: 'Installed', version: undefined }, '^1.0.0-rc.4')).toBeUndefined()
  })
})

describe('formatDrizzleMessage', () => {
  it('names the installed version, the range and the upgrade command', () => {
    expect(formatDrizzleMessage({
      problem: { _tag: 'OutOfRange', version: '0.45.2' },
      requested,
      peerRange: '^1.0.0-rc.4',
    })).toBe([
      'These features need the database: runtime indexing (`aiReady.runtimeSync`).',
      'The database needs `drizzle-orm` ^1.0.0-rc.4. This app installs 0.45.2.',
      'Upgrade it: npx nypm add drizzle-orm@1.0.0-rc.4',
    ].join('\n'))
  })
})
