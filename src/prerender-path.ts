import { relative, resolve } from 'node:path'
import { parseURL } from 'ufo'
import { toLogicalRoute } from './runtime/route-path'

type ParsedPrerenderRoute = { _tag: 'Valid', route: string } | { _tag: 'Invalid' }

/** Reject unsafe raw paths before URL parsing can normalize dot segments. */
export function parsePrerenderRoute(input: string, baseURL: string): ParsedPrerenderRoute {
  let pathname = parseURL(input).pathname
  try {
    pathname = decodeURIComponent(pathname)
  }
  catch {
    return { _tag: 'Invalid' }
  }
  while (true) {
    if (pathname.includes('\\') || [...pathname].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || pathname.split('/').some(segment => segment === '.' || segment === '..'))
      return { _tag: 'Invalid' }
    // Further escapes can hide traversal. Decoded literal percent signs are valid names.
    const decoded = pathname.replace(/%([\da-f]{2})/gi, (_, byte: string) => String.fromCharCode(Number.parseInt(byte, 16)))
    if (decoded === pathname)
      break
    pathname = decoded
  }
  return { _tag: 'Valid', route: toLogicalRoute(input, baseURL) }
}

/** Resolve every filesystem read or write beneath its trusted root. */
export function resolvePrerenderFile(root: string, route: string): string {
  if (parsePrerenderRoute(route, '/')._tag === 'Invalid')
    throw new Error(`Unsafe prerender file path: ${route}`)
  const destination = resolve(root, `.${route.startsWith('/') ? route : `/${route}`}`)
  const child = relative(resolve(root), destination)
  if (child === '..' || child.startsWith('../') || child.startsWith('..\\'))
    throw new Error(`Prerender file path escapes its root: ${route}`)
  return destination
}
