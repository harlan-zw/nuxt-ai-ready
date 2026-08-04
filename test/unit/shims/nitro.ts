export * from 'nitropack/runtime'

export function fetchRawWithEvent(
  event: { fetch: typeof globalThis.fetch },
  request: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return event.fetch(request, init)
}
