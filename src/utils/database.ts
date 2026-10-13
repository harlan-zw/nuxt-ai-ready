import { isAbsolute, join } from 'pathe'

export type DatabaseType = 'sqlite' | 'bun' | 'd1' | 'libsql' | 'neon' | 'postgres'

/** Explicit opt-out value for `aiReady.database.type`. */
export const DATABASE_TYPE_NONE = 'none'

export interface DatabaseOptions {
  type?: DatabaseType | typeof DATABASE_TYPE_NONE
  filename?: string
  bindingName?: string
  url?: string
  authToken?: string
}

/** Raw value accepted by `aiReady.database`. */
export type DatabaseInput = false | DatabaseOptions

/**
 * Database state after parsing. Every consumer reads `_tag` first, so a
 * disabled database can never carry a driver, a path, or credentials.
 */
export type ResolvedDatabase
  = | { _tag: 'Disabled' }
    | {
      _tag: 'Enabled'
      type: DatabaseType
      filename?: string
      bindingName?: string
      url?: string
      authToken?: string
    }

export interface DatabaseLog {
  level: 'debug' | 'warn'
  message: string
}

/** Module options that cannot run without a database. */
export const DATABASE_DEPENDENT_OPTIONS = ['runtimeSync', 'cron'] as const

export type DatabaseDependentOption = typeof DATABASE_DEPENDENT_OPTIONS[number]

export type DatabaseConsumer = DatabaseDependentOption | 'mcp' | 'webmcp'

const DATABASE_CONSUMER_LABELS: Record<DatabaseConsumer, string> = {
  runtimeSync: 'runtime indexing (`aiReady.runtimeSync`)',
  cron: 'the indexing cron (`aiReady.cron`)',
  mcp: 'MCP site tools (`@nuxtjs/mcp-toolkit`)',
  webmcp: 'WebMCP site tools (`aiReady.webmcp`)',
}

interface SemVer {
  core: [number, number, number]
  prerelease: string[]
}

const RE_SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i
const RE_NUMERIC = /^\d+$/

function parseSemVer(input: string): SemVer | undefined {
  const match = RE_SEMVER.exec(input.trim())
  if (!match)
    return undefined
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  }
}

function compareCore(a: SemVer['core'], b: SemVer['core']): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i])
      return a[i]! < b[i]! ? -1 : 1
  }
  return 0
}

// A release ranks above its prereleases. Numeric identifiers compare as numbers.
function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0)
    return 0
  if (a.length === 0)
    return 1
  if (b.length === 0)
    return -1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i]
    const right = b[i]
    if (left === undefined)
      return -1
    if (right === undefined)
      return 1
    if (left === right)
      continue
    const leftNumeric = RE_NUMERIC.test(left)
    const rightNumeric = RE_NUMERIC.test(right)
    if (leftNumeric && rightNumeric)
      return Number(left) < Number(right) ? -1 : 1
    if (leftNumeric !== rightNumeric)
      return leftNumeric ? -1 : 1
    return left < right ? -1 : 1
  }
  return 0
}

export type PeerRangeMatch
  = | { _tag: 'Satisfied' }
    | { _tag: 'Unsatisfied' }
    | { _tag: 'Unparsed' }

/**
 * Check a version against a caret range such as `^1.0.0-rc.4`, with npm's
 * prerelease rule: a prerelease matches only on the range's own
 * `major.minor.patch`. Any other range shape is `Unparsed`.
 */
export function matchCaretRange(version: string, range: string): PeerRangeMatch {
  const installed = parseSemVer(version)
  const minimum = range.trim().startsWith('^') ? parseSemVer(range.trim().slice(1)) : undefined
  if (!installed || !minimum)
    return { _tag: 'Unparsed' }

  const [major, minor, patch] = minimum.core
  const ceiling: SemVer['core'] = major > 0
    ? [major + 1, 0, 0]
    : minor > 0
      ? [0, minor + 1, 0]
      : [0, 0, patch + 1]
  const sameCore = compareCore(installed.core, minimum.core) === 0
  const satisfied = (compareCore(installed.core, minimum.core) > 0
    || (sameCore && comparePrerelease(installed.prerelease, minimum.prerelease) >= 0))
  && compareCore(installed.core, ceiling) < 0
  && (installed.prerelease.length === 0 || (sameCore && minimum.prerelease.length > 0))
  return satisfied ? { _tag: 'Satisfied' } : { _tag: 'Unsatisfied' }
}

/** The `drizzle-orm` the app root resolves, if any. */
export type DrizzleInstall
  = | { _tag: 'Missing' }
    | { _tag: 'Installed', version: string | undefined }

export type DrizzleProblem
  = | { _tag: 'Missing' }
    | { _tag: 'OutOfRange', version: string }

/**
 * Decide whether the installed `drizzle-orm` can run the database. A version
 * that cannot be read or a range that cannot be parsed passes, so an unusual
 * install never blocks setup on a guess.
 */
export function checkDrizzleInstall(install: DrizzleInstall, peerRange: string | undefined): DrizzleProblem | undefined {
  if (install._tag === 'Missing')
    return { _tag: 'Missing' }
  if (!install.version || !peerRange)
    return undefined
  return matchCaretRange(install.version, peerRange)._tag === 'Unsatisfied'
    ? { _tag: 'OutOfRange', version: install.version }
    : undefined
}

/**
 * Explain why setup needs `drizzle-orm` and how to install it. `peerRange` is
 * the package's caret range, so its version is the lowest one it accepts.
 * The highest match for a caret prerelease range can be an untested preview build.
 */
export function formatDrizzleMessage(input: {
  problem: DrizzleProblem
  requested: Record<DatabaseConsumer, boolean>
  peerRange: string | undefined
}): string {
  const consumers = (Object.keys(DATABASE_CONSUMER_LABELS) as DatabaseConsumer[])
    .filter(consumer => input.requested[consumer])
  const subject = consumers.length === 0
    ? 'The `aiReady.database` option turns on the database.'
    : `These features need the database: ${consumers.map(consumer => DATABASE_CONSUMER_LABELS[consumer]).join(', ')}.`
  const version = input.peerRange?.replace(/^\^/, '')
  const command = `npx nypm add drizzle-orm${version ? `@${version}` : ''}`
  const lines = input.problem._tag === 'Missing'
    ? [
        subject,
        'The database needs `drizzle-orm`. This app does not install it.',
        `Install it: ${command}`,
      ]
    : [
        subject,
        `The database needs \`drizzle-orm\` ${input.peerRange}. This app installs ${input.problem.version}.`,
        `Upgrade it: ${command}`,
      ]
  if (consumers.length > 0 && consumers.every(consumer => consumer === 'mcp' || consumer === 'webmcp'))
    lines.push('If you do not need the site tools, set `aiReady.database: false`.')
  return lines.join('\n')
}

export interface ResolveDatabaseInput {
  database: DatabaseInput | undefined
  /** Project root, used to make a relative SQLite filename absolute. */
  rootDir: string
  /** Nitro deployment preset, used to pick a driver when `type` is absent. */
  preset: string
  /** True when a Postgres connection string is available. */
  hasPostgresUrl: boolean
  /** Features that use stored pages. */
  requested: Record<DatabaseConsumer, boolean>
}

export type DatabaseResolution
  = | { _tag: 'Resolved', database: ResolvedDatabase, logs: DatabaseLog[] }
    | { _tag: 'Invalid', conflicts: DatabaseDependentOption[], message: string }

const DEFAULT_SQLITE_FILENAME = '.data/ai-ready/pages.db'

function formatConflictMessage(conflicts: DatabaseDependentOption[]): string {
  const names = conflicts.map(option => `\`aiReady.${option}\``).join(', ')
  return `The database is disabled, so these options cannot run: ${names}. `
    + `Remove the listed options, or enable the database.`
}

function resolveDatabaseType(
  options: DatabaseOptions,
  preset: string,
  hasPostgresUrl: boolean,
  logs: DatabaseLog[],
): DatabaseType {
  if (options.type && options.type !== DATABASE_TYPE_NONE)
    return options.type

  if (preset.startsWith('cloudflare')) {
    logs.push({ level: 'debug', message: `Auto-detected Cloudflare preset "${preset}", using D1 database` })
    return 'd1'
  }
  const isVercel = preset === 'vercel' || preset === 'vercel-edge'
  if (isVercel && hasPostgresUrl) {
    logs.push({ level: 'debug', message: `Auto-detected Vercel preset with POSTGRES_URL, using Neon serverless driver` })
    return 'neon'
  }
  if (preset === 'vercel-edge') {
    logs.push({
      level: 'warn',
      message: `Vercel Edge has no filesystem. Set POSTGRES_URL (Vercel Postgres) or configure database.type: 'libsql' for full functionality.`,
    })
    // Fails at runtime with a driver level error when no URL is present.
    return 'neon'
  }
  if (preset === 'bun') {
    logs.push({ level: 'debug', message: `Auto-detected Bun preset, using bun:sqlite driver` })
    return 'bun'
  }
  return 'sqlite'
}

/**
 * Parse the raw `aiReady.database` option into the state the rest of the
 * module trusts. Disabling the database conflicts with every option that
 * writes pages at runtime, so those combinations return an error value.
 */
export function resolveDatabaseConfig(input: ResolveDatabaseInput): DatabaseResolution {
  const options = input.database === false ? undefined : input.database
  const explicitlyDisabled = input.database === false || options?.type === DATABASE_TYPE_NONE

  if (explicitlyDisabled) {
    const conflicts = DATABASE_DEPENDENT_OPTIONS.filter(option => input.requested[option])
    if (conflicts.length > 0)
      return { _tag: 'Invalid', conflicts, message: formatConflictMessage(conflicts) }
    return { _tag: 'Resolved', database: { _tag: 'Disabled' }, logs: [] }
  }

  const databaseNeeded = Object.values(input.requested).some(Boolean)
  if (input.database === undefined && !databaseNeeded)
    return { _tag: 'Resolved', database: { _tag: 'Disabled' }, logs: [] }

  const logs: DatabaseLog[] = []
  const config = options || {}
  const type = resolveDatabaseType(config, input.preset, input.hasPostgresUrl, logs)

  if (type === 'sqlite' || type === 'bun') {
    const filename = config.filename || DEFAULT_SQLITE_FILENAME
    return {
      _tag: 'Resolved',
      logs,
      database: {
        _tag: 'Enabled',
        type,
        filename: isAbsolute(filename) ? filename : join(input.rootDir, filename),
      },
    }
  }

  if (type === 'd1') {
    return {
      _tag: 'Resolved',
      logs,
      database: { _tag: 'Enabled', type, bindingName: config.bindingName || 'DB' },
    }
  }

  if (type === 'neon' || type === 'postgres') {
    // `url` falls back to POSTGRES_URL or DATABASE_URL at runtime.
    return {
      _tag: 'Resolved',
      logs,
      database: { _tag: 'Enabled', type, url: config.url },
    }
  }

  return {
    _tag: 'Resolved',
    logs,
    database: { _tag: 'Enabled', type: 'libsql', url: config.url, authToken: config.authToken },
  }
}
