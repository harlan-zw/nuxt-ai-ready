let release: (() => void) | undefined
let completion: Promise<number> | undefined

export function deferDatabaseWork(run: (gate: Promise<void>) => Promise<number>): void {
  const gate = new Promise<void>((resolve) => { release = resolve })
  completion = run(gate)
}

export async function releaseDatabaseWork(): Promise<number> {
  if (!release || !completion)
    throw new Error('Start the deferred database probe first.')
  release()
  return completion
}
