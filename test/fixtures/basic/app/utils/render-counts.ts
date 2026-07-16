// Module scope so the count survives across SSR renders within the prerender
// process; lets tests detect a page being rendered more than once.
const counts = new Map<string, number>()

export function incrementRenderCount(path: string): number {
  const n = (counts.get(path) ?? 0) + 1
  counts.set(path, n)
  return n
}
