// Bun runtime types - only used when building for Bun
declare module 'bun:sqlite' {
  export class Database {
    constructor(filename: string)
    close(): void
    exec(sql: string): void
    prepare<T = unknown>(sql: string): Statement<T>
    query<T = unknown>(sql: string): Statement<T>
    run(sql: string, ...params: unknown[]): void
    get filename(): string | null
    get inTransaction(): boolean
    transaction<T>(fn: () => T): () => T
  }
  export class Statement<T = unknown> {
    run(...params: unknown[]): void
    get(...params: unknown[]): T | undefined
    all(...params: unknown[]): T[]
    values(...params: unknown[]): unknown[][]
    finalize(): void
  }
}

declare module '#ai-ready-virtual/logger.mjs' {
  import type { ConsolaInstance } from 'consola'

  export const logger: ConsolaInstance
}

declare module '#ai-ready-virtual/db-provider.mjs' {
  import type { H3Event } from 'h3'

  interface DrizzleDatabase {
    dialect: 'sqlite' | 'postgres'
    db: unknown
  }

  export function createClient(event?: H3Event): Promise<DrizzleDatabase>
}

declare module '#ai-ready-virtual/db-schema.mjs' {
  // Types match sqlite schema - postgres schema has identical structure
  export { cronRuns, indexnowLog, info, pages, schema, sitemaps } from './runtime/server/db/schema/sqlite'
}
