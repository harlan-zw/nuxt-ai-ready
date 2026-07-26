import type { WebMcpRegisterOptions, WebMcpTool } from '../../webmcp'
import { onScopeDispose } from 'vue'
import { checkToolBudget, getModelContext, registerTool } from '../../webmcp'

export interface UseWebMcpToolReturn {
  /** Whether the browser exposes `document.modelContext`. */
  supported: boolean
  /** Remove the tool from the page's model context. */
  unregister: () => void
}

/** Whether the current browser supports WebMCP. Always false during SSR. */
export function isWebMcpSupported(): boolean {
  return !!getModelContext()
}

/**
 * Register a WebMCP tool for the lifetime of the current effect scope, so
 * agents only see tools for the state the page is actually in.
 *
 * @example
 * ```ts
 * useWebMcpTool({
 *   name: 'filter_products',
 *   description: 'Filters the product list by price range.',
 *   inputSchema: {
 *     type: 'object',
 *     properties: { maxPrice: { type: 'number', description: 'Highest price to show.' } },
 *     required: ['maxPrice'],
 *   },
 *   annotations: { readOnlyHint: true },
 *   execute: ({ maxPrice }) => {
 *     filters.value.maxPrice = maxPrice
 *     return `Showing products under ${maxPrice}.`
 *   },
 * })
 * ```
 */
export function useWebMcpTool<Input extends Record<string, any> = Record<string, any>>(
  tool: WebMcpTool<Input>,
  options: WebMcpRegisterOptions = {},
): UseWebMcpToolReturn {
  const modelContext = getModelContext()
  if (!modelContext)
    return { supported: false, unregister: () => {} }

  if (import.meta.dev) {
    for (const warning of checkToolBudget(tool))
      console.warn(`[nuxt-ai-ready] ${warning}`)
  }

  const controller = new AbortController()
  const unregister = () => controller.abort()

  options.signal?.addEventListener('abort', unregister, { once: true })

  // Only send exposedTo when it holds origins: WebIDL rejects a null or
  // non-iterable value where it expects a sequence.
  const registerOptions: WebMcpRegisterOptions = { signal: controller.signal }
  if (options.exposedTo?.length)
    registerOptions.exposedTo = options.exposedTo

  registerTool(modelContext, tool, registerOptions)

  onScopeDispose(unregister, true)

  return { supported: true, unregister }
}
