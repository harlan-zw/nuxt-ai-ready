import { isAbsolute, join } from 'pathe'

export type DatabaseType = 'sqlite' | 'bun' | 'd1' | 'libsql' | 'neon' | 'postgres'

/** Node versions that expose `node:sqlite` without a command flag. */
export function supportsNativeNodeSqlite(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  if (major === 22)
    return minor >= 13
  if (major === 23)
    return minor >= 4
  return major > 23
}

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
