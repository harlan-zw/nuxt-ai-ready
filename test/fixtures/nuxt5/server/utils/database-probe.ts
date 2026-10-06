let driver: { readonly isOpen: boolean } | undefined

export function recordNativeDriver(client: unknown): void {
  if (!client || typeof client !== 'object' || !('$client' in client))
    throw new Error('Expected a native SQLite Drizzle client.')
  const candidate = client.$client
  if (!candidate || typeof candidate !== 'object' || !('isOpen' in candidate) || typeof candidate.isOpen !== 'boolean')
    throw new Error('Expected a native SQLite database state.')
  driver = candidate as { readonly isOpen: boolean }
}

export function readNativeDriverState(): boolean | undefined {
  return driver?.isOpen
}
