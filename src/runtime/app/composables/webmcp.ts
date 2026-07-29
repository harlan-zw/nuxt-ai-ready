import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from 'vue'
import type {
  InferWebMcpInput,
  WebMcpInputSchema,
  WebMcpRegisterOptions,
  WebMcpTool,
  WebMcpToolRegistrationState,
} from '../../webmcp'
import {
  computed,
  getCurrentInstance,
  onActivated,
  onDeactivated,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
} from 'vue'
import { checkToolBudget, getModelContext, registerTool } from '../../webmcp'
import { getWebMcpDefaults } from '../webmcp-config'

export interface UseWebMcpToolOptions extends WebMcpRegisterOptions {
  /** Register only while this reactive value is true. */
  enabled?: MaybeRefOrGetter<boolean>
}

export interface UseWebMcpToolReturn {
  /** Whether the mounted client supports `document.modelContext`. */
  supported: ComputedRef<boolean>
  /** Registration lifecycle, including browser rejections. */
  state: Readonly<ShallowRef<WebMcpToolRegistrationState>>
  /** Remove the tool permanently for this composable instance. */
  unregister: () => void
}

/**
 * Hydration-safe WebMCP support. It stays false through SSR and the first client
 * render, then updates after mount.
 */
export function useWebMcpSupported(): ComputedRef<boolean> {
  const inComponent = !!getCurrentInstance()
  const mounted = ref(!inComponent)
  if (inComponent)
    onMounted(() => mounted.value = true)
  return computed(() => mounted.value && !!getModelContext())
}

/**
 * Register a WebMCP tool while its component is mounted, active and enabled.
 */
export function useWebMcpTool<
  const Schema extends WebMcpInputSchema,
  Output,
>(
  tool: WebMcpTool<InferWebMcpInput<NoInfer<Schema>>, Output, Schema>,
  options?: UseWebMcpToolOptions,
): UseWebMcpToolReturn
export function useWebMcpTool<
  Input extends Record<string, unknown>,
  Output,
>(
  tool: WebMcpTool<Input, Output>,
  options?: UseWebMcpToolOptions,
): UseWebMcpToolReturn
export function useWebMcpTool(
  tool: WebMcpTool<any, any>,
  options: UseWebMcpToolOptions = {},
): UseWebMcpToolReturn {
  const inComponent = !!getCurrentInstance()
  const state = shallowRef<WebMcpToolRegistrationState>({ _tag: 'Unsupported' })
  const supported = computed(() => state.value._tag !== 'Unsupported')
  const defaultExposedTo = getWebMcpDefaults().exposedTo
  let mounted = !inComponent
  let active = true
  let permanentlyDisabled = options.signal?.aborted === true
  let controller: AbortController | undefined

  const stopRegistration = () => {
    const current = controller
    controller = undefined
    current?.abort()
    state.value = getModelContext() ? { _tag: 'Inactive' } : { _tag: 'Unsupported' }
  }

  const syncRegistration = () => {
    if (!mounted)
      return

    const modelContext = getModelContext()
    if (!modelContext) {
      stopRegistration()
      return
    }
    if (!active || permanentlyDisabled || !toValue(options.enabled ?? true)) {
      stopRegistration()
      return
    }
    if (controller)
      return

    if (import.meta.dev) {
      for (const warning of checkToolBudget(tool))
        console.warn(`[nuxt-ai-ready] ${warning}`)
    }

    const current = new AbortController()
    controller = current
    state.value = { _tag: 'Registering' }

    const registerOptions: WebMcpRegisterOptions = { signal: current.signal }
    const exposedTo = options.exposedTo ?? defaultExposedTo
    if (exposedTo?.length)
      registerOptions.exposedTo = exposedTo

    void registerTool(modelContext, tool, registerOptions).then((result) => {
      if (controller !== current || current.signal.aborted)
        return
      if (result._tag === 'Registered') {
        state.value = result
        return
      }
      controller = undefined
      state.value = { _tag: 'Failed', error: result.error }
    })
  }

  const unregister = () => {
    permanentlyDisabled = true
    stopRegistration()
  }

  const callerSignal = options.signal
  const abortFromCaller = () => unregister()
  if (callerSignal && !callerSignal.aborted)
    callerSignal.addEventListener('abort', abortFromCaller, { once: true })

  watch(() => toValue(options.enabled ?? true), syncRegistration)

  if (inComponent) {
    onMounted(() => {
      mounted = true
      syncRegistration()
    })
    onActivated(() => {
      active = true
      syncRegistration()
    })
    onDeactivated(() => {
      active = false
      stopRegistration()
    })
  }
  else {
    syncRegistration()
  }

  onScopeDispose(() => {
    callerSignal?.removeEventListener('abort', abortFromCaller)
    stopRegistration()
  }, true)

  return { supported, state, unregister }
}
