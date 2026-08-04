export * from 'h3'

export function fetchWithEvent(event: { fetch: typeof globalThis.fetch }, ...args: Parameters<typeof globalThis.fetch>) {
  return event.fetch(...args)
}
