/**
 * WebMCP lets a page register tools that in-browser AI agents can discover and
 * call through `document.modelContext`. The API is an origin trial from Chrome
 * 149 and has no lib.dom typings yet, so the surface is declared here.
 *
 * @see https://developer.chrome.com/docs/ai/webmcp
 */

export interface WebMcpToolAnnotations {
  /** Tool does not change state, letting agents skip user confirmation. */
  readOnlyHint?: boolean
  /** Output may contain user-generated or third-party content. */
  untrustedContentHint?: boolean
}

export interface WebMcpToolResult {
  content: Array<{ type: 'text', text: string }>
  isError?: boolean
}

export interface WebMcpInputSchema {
  type: 'object'
  properties?: Record<string, Record<string, unknown>>
  required?: string[]
}

export interface WebMcpTool<Input = Record<string, any>> {
  /** Unique identifier, snake_case and 30 characters or fewer. */
  name: string
  /** Human readable label shown in agent UIs. */
  title?: string
  /** What the tool does, 500 characters or fewer. */
  description: string
  /** JSON Schema describing the input object. */
  inputSchema?: WebMcpInputSchema
  annotations?: WebMcpToolAnnotations
  execute: (input: Input) => WebMcpToolResult | string | Promise<WebMcpToolResult | string>
}

export interface WebMcpRegisterOptions {
  /** Abort to unregister the tool. */
  signal?: AbortSignal
  /** Secure origins allowed to discover the tool. Same-origin only by default. */
  exposedTo?: string[]
}

export interface WebMcpRegisteredTool {
  name: string
  title?: string
  description: string
  /** Serialised JSON Schema. */
  inputSchema?: string
  origin: string
  annotations?: WebMcpToolAnnotations
}

export interface WebMcpModelContext extends EventTarget {
  registerTool: (tool: WebMcpTool<any>, options?: WebMcpRegisterOptions) => Promise<void>
  getTools: (options?: { fromOrigins?: string[] }) => Promise<WebMcpRegisteredTool[]>
  executeTool: (tool: WebMcpRegisteredTool, input: string, options?: { signal?: AbortSignal }) => Promise<unknown>
}

/**
 * Character budgets recommended by WebMCP to stay inside agent guardrails.
 * @see https://developer.chrome.com/docs/ai/webmcp/secure-tools
 */
export const WEB_MCP_BUDGET = {
  name: 30,
  description: 500,
  paramDescription: 150,
  output: 1500,
} as const

/** The page's model context, or undefined when the browser has no WebMCP support. */
export function getModelContext(): WebMcpModelContext | undefined {
  if (typeof document === 'undefined')
    return undefined
  return (document as Document & { modelContext?: WebMcpModelContext }).modelContext
}

/**
 * Register a tool without assuming the browser follows the spec's return type.
 * Chrome's origin trial build reports argument errors by throwing and returns
 * nothing where the IDL promises a Promise.
 */
export function registerTool(
  modelContext: WebMcpModelContext,
  tool: WebMcpTool<any>,
  options: WebMcpRegisterOptions = {},
): void {
  const onError = (error: unknown) => {
    console.error(`[nuxt-ai-ready] Failed to register WebMCP tool "${tool.name}".`, error)
  }
  try {
    const result = modelContext.registerTool(tool, options) as Promise<void> | undefined
    if (typeof result?.then === 'function')
      result.then(undefined, onError)
  }
  catch (error) {
    onError(error)
  }
}

/** Collect budget violations for a tool. Used to warn during development. */
export function checkToolBudget(tool: WebMcpTool<any>): string[] {
  const warnings: string[] = []
  if (tool.name.length > WEB_MCP_BUDGET.name)
    warnings.push(`Tool name "${tool.name}" is ${tool.name.length} characters, over the ${WEB_MCP_BUDGET.name} character budget.`)
  if (tool.description.length > WEB_MCP_BUDGET.description)
    warnings.push(`Description for "${tool.name}" is ${tool.description.length} characters, over the ${WEB_MCP_BUDGET.description} character budget.`)
  for (const [param, schema] of Object.entries(tool.inputSchema?.properties || {})) {
    const description = typeof schema.description === 'string' ? schema.description : ''
    if (description.length > WEB_MCP_BUDGET.paramDescription)
      warnings.push(`Description for "${tool.name}.${param}" is ${description.length} characters, over the ${WEB_MCP_BUDGET.paramDescription} character budget.`)
  }
  return warnings
}

/**
 * Trim tool output to the configured budget, telling the agent where to read
 * the rest instead of silently dropping content.
 */
export function truncateToolOutput(text: string, maxChars: number, hint?: string): string {
  if (maxChars <= 0 || text.length <= maxChars)
    return text
  const notice = hint
    ? `\n\n[Truncated at ${maxChars} characters. ${hint}]`
    : `\n\n[Truncated at ${maxChars} characters.]`
  return text.slice(0, maxChars) + notice
}

export function toolText(text: string): WebMcpToolResult {
  return { content: [{ type: 'text', text }] }
}

export function toolError(message: string): WebMcpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}
