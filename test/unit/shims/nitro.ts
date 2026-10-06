export * from 'nitropack/runtime'

export async function localFetch(): Promise<Response> {
  throw new Error('The unit test has no Nitro server.')
}

export function fetchRawWithEvent(
  event: { fetch: typeof globalThis.fetch },
  request: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return event.fetch(request, init)
}
