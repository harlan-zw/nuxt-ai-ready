import type { H3Event } from '#nuxtseo/h3'
import { checkAndHandleStale } from '../utils/checkStale'

type EnsureResult
  = | { _tag: 'Idle' }
    | { _tag: 'Running', promise: Promise<void> }
    | { _tag: 'Ready' }

interface McpDataNitroApp {
  hooks: {
    hook: (name: 'mcp:config:resolved', handler: (payload: { event: H3Event }) => Promise<void>) => unknown
  }
}

export default function mcpDataPlugin(nitroApp: McpDataNitroApp): void {
  let state: EnsureResult = { _tag: 'Idle' }

  const ensureData = (event: H3Event): Promise<void> => {
    if (state._tag === 'Ready')
      return Promise.resolve()
    if (state._tag === 'Running')
      return state.promise

    const promise = checkAndHandleStale(event).then(
      () => {
        state = { _tag: 'Ready' }
      },
      (error) => {
        state = { _tag: 'Idle' }
        return Promise.reject(error)
      },
    )
    state = { _tag: 'Running', promise }
    return promise
  }

  nitroApp.hooks.hook('mcp:config:resolved', ({ event }) => ensureData(event))
}
