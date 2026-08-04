export interface McpToolkitOptions {
  enabled?: boolean
  route?: string
  name?: string
  version?: string
  description?: string
  instructions?: string
  icons?: Array<{
    src: string
    mimeType?: string
    sizes?: string[]
    theme?: 'light' | 'dark'
  }>
}

export type McpToolkitState
  = | { _tag: 'Absent' }
    | { _tag: 'Disabled' }
    | { _tag: 'Static' }
    | { _tag: 'Enabled', route: string }

export function hasConfiguredNuxtModule(modules: unknown[], name: string): boolean {
  return modules.some((entry) => {
    const module = Array.isArray(entry) ? entry[0] : entry
    if (typeof module === 'string')
      return module === name
    if ((typeof module === 'function' || (typeof module === 'object' && module !== null)) && 'meta' in module)
      return (module as { meta?: { name?: string } }).meta?.name === name
    return false
  })
}

export function resolveMcpToolkitState(input: {
  installed: boolean
  options: false | McpToolkitOptions | undefined
  static: boolean
  generating: boolean
}): McpToolkitState {
  if (!input.installed)
    return { _tag: 'Absent' }
  if (input.options === false || input.options?.enabled === false)
    return { _tag: 'Disabled' }
  if (input.static || input.generating)
    return { _tag: 'Static' }
  return { _tag: 'Enabled', route: input.options?.route || '/mcp' }
}
