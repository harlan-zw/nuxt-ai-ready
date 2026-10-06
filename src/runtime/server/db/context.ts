import type { RequestEvent } from 'nuxt/server'

export const DB_CONTEXT_KEY = '_aiReadyDrizzle'
export const DB_PROMISE_CONTEXT_KEY = '_aiReadyDrizzlePromise'
export const DB_WORK_CONTEXT_KEY = '_aiReadyDrizzleWork'

/** Database clients need request context for bindings and response cleanup. */
export type AiReadyDatabaseEvent = Pick<RequestEvent, 'context'> & {
  req?: { headers: Headers | Record<string, string | string[] | undefined> }
  node?: { req: { headers: Record<string, string | string[] | undefined> } }
  waitUntil?: (promise: Promise<unknown>) => void
}
