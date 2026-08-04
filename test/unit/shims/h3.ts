export * from 'h3'

interface FetchWithEventOptions {
  fetch?: typeof globalThis.fetch
}

export function fetchWithEvent(
  _event: unknown,
  request: RequestInfo | URL,
  init?: RequestInit,
  options?: FetchWithEventOptions,
) {
  return (options?.fetch || globalThis.fetch)(request, init)
}
