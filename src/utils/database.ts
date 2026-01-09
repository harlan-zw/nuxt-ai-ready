import type { Resolver } from '@nuxt/kit'
import { isAbsolute, join } from 'pathe'

export const databaseVersion = 'v1.0.0'

export interface DatabaseConfig {
  type?: 'sqlite' | 'd1' | 'libsql'
  filename?: string
  bindingName?: string
  url?: string
  authToken?: string
}

export interface RefinedDatabaseConfig {
  type: 'sqlite' | 'd1' | 'libsql'
  filename?: string
  bindingName?: string
  url?: string
  authToken?: string
}

/**
 * Resolve the database adapter connector path based on type and runtime
 */
export async function resolveDatabaseAdapter(
  type: 'sqlite' | 'd1' | 'libsql' | undefined,
  _opts: { resolver: Resolver },
): Promise<string> {
  const connectors: Record<string, string> = {
    d1: 'db0/connectors/cloudflare-d1',
    libsql: 'db0/connectors/libsql/node',
  }

  if (type && type !== 'sqlite' && connectors[type]) {
    return connectors[type]
  }

  // Auto-detect best SQLite connector
  if (process.versions.bun) {
    return 'db0/connectors/bun-sqlite'
  }

  // Check if node:sqlite available (Node 22.5+)
  const nodeVersion = Number.parseInt(process.versions.node?.split('.')[0] || '0')
  if (nodeVersion >= 22) {
    return 'db0/connectors/node-sqlite'
  }

  return 'db0/connectors/better-sqlite3'
}

/**
 * Refine database config with defaults and path resolution
 */
export function refineDatabaseConfig(
  config: DatabaseConfig,
  rootDir: string,
): RefinedDatabaseConfig {
  const type = config.type || 'sqlite'

  if (type === 'sqlite') {
    const filename = config.filename || '.data/ai-ready/pages.db'
    return {
      type: 'sqlite',
      filename: isAbsolute(filename) ? filename : join(rootDir, filename),
    }
  }

  if (type === 'd1') {
    return {
      type: 'd1',
      bindingName: config.bindingName || 'AI_READY_DB',
    }
  }

  // libsql
  return {
    type: 'libsql',
    url: config.url,
    authToken: config.authToken,
  }
}
