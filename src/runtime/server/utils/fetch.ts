import type { H3Event } from 'h3'

type FetchFn = (url: string, opts?: Record<string, unknown>) => Promise<unknown>

/**
 * Get a $fetch instance that works in both request and cron contexts
 * Uses event.$fetch when available, falls back to globalThis.$fetch for scheduled tasks
 */
export function useFetch(event?: H3Event): FetchFn {
  if (event?.$fetch)
    return event.$fetch as FetchFn
  // Fallback for scheduled tasks (Cloudflare Workers cron)
  return globalThis.$fetch as FetchFn
}
