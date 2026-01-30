import { isAbsolute, join } from 'pathe'

export type DatabaseType = 'sqlite' | 'bun' | 'd1' | 'libsql' | 'neon'

export interface DatabaseConfig {
  type?: DatabaseType
  filename?: string
  bindingName?: string
  url?: string
  authToken?: string
}

export interface RefinedDatabaseConfig {
  type: DatabaseType
  filename?: string
  bindingName?: string
  url?: string
  authToken?: string
}

/**
 * Refine database config with defaults and path resolution
 */
export function refineDatabaseConfig(
  config: DatabaseConfig,
  rootDir: string,
): RefinedDatabaseConfig {
  const type = config.type || 'sqlite'

  if (type === 'sqlite' || type === 'bun') {
    const filename = config.filename || '.data/ai-ready/pages.db'
    return {
      type,
      filename: isAbsolute(filename) ? filename : join(rootDir, filename),
    }
  }

  if (type === 'd1') {
    return {
      type: 'd1',
      bindingName: config.bindingName || 'DB',
    }
  }

  if (type === 'neon') {
    return {
      type: 'neon',
      url: config.url, // Will fallback to POSTGRES_URL at runtime
    }
  }

  // libsql
  return {
    type: 'libsql',
    url: config.url,
    authToken: config.authToken,
  }
}
