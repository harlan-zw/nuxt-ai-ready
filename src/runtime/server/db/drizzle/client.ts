import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { AiReadyDatabaseEvent } from '../context'
import { DB_CONTEXT_KEY, DB_PROMISE_CONTEXT_KEY, DB_WORK_CONTEXT_KEY } from '../context'
import { closeDriver } from './raw'

export type DatabaseDialect = 'sqlite' | 'postgres'

type SQLiteDB = SQLiteBunDatabase | LibSQLDatabase | DrizzleD1Database | NodeSQLiteDatabase
type PostgresDB = NeonHttpDatabase | PostgresJsDatabase

export interface DrizzleDatabase {
  dialect: DatabaseDialect
  db: SQLiteDB | PostgresDB
}

let fallbackClient: DrizzleDatabase | undefined
let fallbackClientPromise: Promise<DrizzleDatabase> | undefined

function createDrizzleClient(event?: AiReadyDatabaseEvent): Promise<DrizzleDatabase> {
  return import('#ai-ready-virtual/db-provider.mjs')
    .then(({ createClient }) => createClient(event) as Promise<DrizzleDatabase>)
}

type DrizzleWorkState
  = | { _tag: 'ResponseOpen', owner: object, pending: Set<Promise<unknown>>, cleanup: () => Promise<void> }
    | { _tag: 'ResponseEnded', owner: object, pending: Set<Promise<unknown>>, cleanup: () => Promise<void> }

function getRequestOwner(event: AiReadyDatabaseEvent): object {
  return event.node?.req ?? event.req ?? event
}

function getDrizzleWorkState(event: AiReadyDatabaseEvent): DrizzleWorkState {
  const context = event.context as Record<string, unknown>
  return (context[DB_WORK_CONTEXT_KEY] ??= {
    _tag: 'ResponseOpen',
    owner: getRequestOwner(event),
    pending: new Set(),
    cleanup: () => closeDrizzle(event),
  }) as DrizzleWorkState
}

/** Keep request-scoped clients alive until deferred database work finishes. */
export function trackDrizzleWork<T>(event: AiReadyDatabaseEvent, work: Promise<T>): Promise<T> {
  const state = getDrizzleWorkState(event)
  const tracked = work.finally(async () => {
    state.pending.delete(tracked)
    if (state._tag === 'ResponseEnded' && state.pending.size === 0)
      await state.cleanup()
  })
  state.pending.add(tracked)
  return tracked
}

/** Transfer client cleanup to deferred work after the response ends. */
export async function finishDrizzleResponse(event: AiReadyDatabaseEvent): Promise<void> {
  const state = getDrizzleWorkState(event)
  if (state.owner !== getRequestOwner(event))
    return
  state._tag = 'ResponseEnded'
  if (state.pending.size === 0)
    await closeDrizzle(event)
}

/**
 * Get Drizzle database instance
 */
export async function useDrizzle(event?: AiReadyDatabaseEvent): Promise<DrizzleDatabase> {
  if (event?.context?.[DB_CONTEXT_KEY]) {
    return event.context[DB_CONTEXT_KEY] as DrizzleDatabase
  }

  if (event?.context?.[DB_PROMISE_CONTEXT_KEY]) {
    return event.context[DB_PROMISE_CONTEXT_KEY] as Promise<DrizzleDatabase>
  }

  if (!event && fallbackClient) {
    return fallbackClient
  }

  if (!event && fallbackClientPromise)
    return fallbackClientPromise

  if (event?.context) {
    getDrizzleWorkState(event)
    const context = event.context
    const promise = createDrizzleClient(event)
      .then((client) => {
        context[DB_CONTEXT_KEY] = client
        return client
      })
      .finally(() => {
        if (context[DB_PROMISE_CONTEXT_KEY] === promise)
          delete context[DB_PROMISE_CONTEXT_KEY]
      })
    context[DB_PROMISE_CONTEXT_KEY] = promise
    return promise
  }

  const promise = createDrizzleClient()
    .then((client) => {
      fallbackClient = client
      return client
    })
    .finally(() => {
      if (fallbackClientPromise === promise)
        fallbackClientPromise = undefined
    })
  fallbackClientPromise = promise
  return promise
}

export async function closeDrizzle(event?: AiReadyDatabaseEvent): Promise<void> {
  if (event?.context) {
    const context = event.context
    const state = context[DB_WORK_CONTEXT_KEY] as DrizzleWorkState | undefined
    if (state && state.owner !== getRequestOwner(event))
      return
    const client = context[DB_CONTEXT_KEY] as DrizzleDatabase | undefined
      ?? await (context[DB_PROMISE_CONTEXT_KEY] as Promise<DrizzleDatabase> | undefined)
    if (!client)
      return
    await closeDriver(client.db)
    delete context[DB_CONTEXT_KEY]
    delete context[DB_PROMISE_CONTEXT_KEY]
  }
  else if (!event) {
    const client = fallbackClient ?? await fallbackClientPromise
    if (!client)
      return
    await closeDriver(client.db)
    fallbackClient = undefined
    fallbackClientPromise = undefined
  }
}
