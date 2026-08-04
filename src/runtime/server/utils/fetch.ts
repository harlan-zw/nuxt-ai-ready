import type { H3Event } from '#nuxtseo/h3'
import { fetchWithEvent as h3FetchWithEvent } from '#nuxtseo/h3'

interface RawEventFetch {
  (
    event: H3Event,
    request: RequestInfo | URL,
    init?: RequestInit,
    options?: { fetch?: typeof globalThis.fetch },
  ): Promise<Response>
}

/** Preserve request context while using Nitro's in-process dispatcher on both majors. */
export function fetchRawWithEvent(event: H3Event, request: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const legacyFetch = (event as H3Event & { fetch?: typeof globalThis.fetch }).fetch
  return (h3FetchWithEvent as RawEventFetch)(
    event,
    request,
    init,
    legacyFetch ? { fetch: (input, options) => legacyFetch(input, options) } : undefined,
  )
}
