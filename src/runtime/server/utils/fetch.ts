import type { H3Event } from '#nuxtseo/h3'
import { fetchRawWithEvent as fetchSharedRawWithEvent } from '#nuxtseo/nitro'

/** Preserve request context while using Nitro's in-process dispatcher on both majors. */
export function fetchRawWithEvent(event: H3Event, request: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetchSharedRawWithEvent(event, request, init)
}
