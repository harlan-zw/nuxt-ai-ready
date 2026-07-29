/**
 * WebMCP lets a page register tools that in-browser AI agents can discover and
 * call through `document.modelContext`. The experimental API has no lib.dom
 * typings yet, so the surface is declared here.
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

export interface WebMcpJsonSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null' | readonly string[]
  title?: string
  description?: string
  enum?: readonly unknown[]
  const?: unknown
  items?: WebMcpJsonSchema
  properties?: WebMcpSchemaProperties
  required?: readonly string[]
  additionalProperties?: boolean | WebMcpJsonSchema
  [key: string]: unknown
}

export type WebMcpSchemaProperties = Record<string, WebMcpJsonSchema>

export type WebMcpInputSchema<
  Properties extends WebMcpSchemaProperties = WebMcpSchemaProperties,
  Required extends readonly (keyof Properties & string)[] = readonly (keyof Properties & string)[],
> = WebMcpJsonSchema & {
  type: 'object'
  properties?: Properties
  required?: Required
}

type Simplify<T> = { -readonly [Key in keyof T]: T[Key] }

export type InferWebMcpSchema<Schema>
  = Schema extends { enum: readonly (infer Value)[] }
    ? Value
    : Schema extends { const: infer Value }
      ? Value
      : Schema extends { type: 'string' }
        ? string
        : Schema extends { type: 'number' | 'integer' }
          ? number
          : Schema extends { type: 'boolean' }
            ? boolean
            : Schema extends { type: 'null' }
              ? null
              : Schema extends { type: 'array', items: infer Item }
                ? InferWebMcpSchema<Item>[]
                : Schema extends WebMcpInputSchema
                  ? InferWebMcpInput<Schema>
                  : unknown

export type InferWebMcpInput<Schema>
  = Schema extends { properties: infer Properties extends WebMcpSchemaProperties }
    ? Simplify<
      & {
        [Key in keyof Properties as Key extends (
          Schema extends { required: readonly (infer Required)[] } ? Required : never
        ) ? Key : never]-?: InferWebMcpSchema<Properties[Key]>
      }
      & {
        [Key in keyof Properties as Key extends (
          Schema extends { required: readonly (infer Required)[] } ? Required : never
        ) ? never : Key]?: InferWebMcpSchema<Properties[Key]>
      }
    >
    : Record<string, unknown>

export interface WebMcpTool<
  Input = Record<string, unknown>,
  Output = unknown,
  Schema extends WebMcpInputSchema | undefined = WebMcpInputSchema | undefined,
> {
  /**
   * Unique identifier of 1 to 128 ASCII letters, digits, underscores, hyphens
   * or dots. Chrome recommends staying within 30 characters.
   */
  name: string
  /** Human readable label shown in agent UIs. */
  title?: string
  /** What the tool does, 500 characters or fewer. */
  description: string
  /** JSON Schema describing the input object. */
  inputSchema?: Schema
  annotations?: WebMcpToolAnnotations
  execute: (input: Input) => Output | Promise<Output>
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
  window: Window
  origin: string
  annotations?: WebMcpToolAnnotations
}

export interface WebMcpModelContext extends EventTarget {
  registerTool: (tool: WebMcpTool<any, any>, options?: WebMcpRegisterOptions) => Promise<void>
  getTools: (options?: { fromOrigins?: string[] }) => Promise<WebMcpRegisteredTool[]>
  /** Chrome API for testing and in-page agents. */
  executeTool: (tool: WebMcpRegisteredTool, input: string, options?: { signal?: AbortSignal }) => Promise<unknown>
  ontoolchange: ((this: WebMcpModelContext, event: Event) => unknown) | null
}

export type WebMcpRegistrationResult
  = | { _tag: 'Registered' }
    | { _tag: 'Error', error: unknown }

export type WebMcpToolRegistrationState
  = | { _tag: 'Unsupported' }
    | { _tag: 'Inactive' }
    | { _tag: 'Registering' }
    | { _tag: 'Registered' }
    | { _tag: 'Failed', error: unknown }

export interface WebMcpToolsContext {
  /** Built-in tools. Mutate this array to add, remove or replace definitions. */
  tools: WebMcpTool<any, any>[]
  /** Registration defaults shared by the built-in tools. */
  registerOptions: WebMcpRegisterOptions
}

export function defineWebMcpTool<
  const Schema extends WebMcpInputSchema | undefined,
  Output,
>(
  tool: WebMcpTool<
    Schema extends WebMcpInputSchema ? InferWebMcpInput<NoInfer<Schema>> : Record<string, unknown>,
    Output,
    Schema
  >,
): typeof tool {
  return tool
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

const RE_WEB_MCP_TOOL_NAME = /^[\w.-]{1,128}$/

/** The page's model context, or undefined when the browser has no WebMCP support. */
export function getModelContext(): WebMcpModelContext | undefined {
  if (typeof document === 'undefined')
    return undefined
  return (document as Document & { modelContext?: WebMcpModelContext }).modelContext
}

/**
 * Register a tool and expose expected browser rejections as a tagged result.
 */
export async function registerTool(
  modelContext: WebMcpModelContext,
  tool: WebMcpTool<any, any>,
  options: WebMcpRegisterOptions = {},
): Promise<WebMcpRegistrationResult> {
  return Promise.resolve()
    .then(() => modelContext.registerTool(tool, options))
    .then(
      () => ({ _tag: 'Registered' }) as const,
      error => ({ _tag: 'Error', error }) as const,
    )
}

/** Collect budget violations for a tool. Used to warn during development. */
export function checkToolBudget(tool: WebMcpTool<any, any>): string[] {
  const warnings: string[] = []
  if (!RE_WEB_MCP_TOOL_NAME.test(tool.name))
    warnings.push(`Tool name "${tool.name}" must use 1 to 128 ASCII letters, digits, underscores, hyphens or dots.`)
  if (tool.name.length > WEB_MCP_BUDGET.name)
    warnings.push(`Tool name "${tool.name}" is ${tool.name.length} characters, over the ${WEB_MCP_BUDGET.name} character budget.`)
  if (!tool.description)
    warnings.push(`Description for "${tool.name}" cannot be empty.`)
  if (tool.description.length > WEB_MCP_BUDGET.description)
    warnings.push(`Description for "${tool.name}" is ${tool.description.length} characters, over the ${WEB_MCP_BUDGET.description} character budget.`)
  for (const [param, schema] of Object.entries(tool.inputSchema?.properties || {})) {
    if (param.length > WEB_MCP_BUDGET.name)
      warnings.push(`Parameter name "${tool.name}.${param}" is ${param.length} characters, over the ${WEB_MCP_BUDGET.name} character budget.`)
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
  const budget = Math.trunc(maxChars)
  if (!Number.isFinite(budget) || budget <= 0 || text.length <= budget)
    return text
  const notice = hint
    ? `\n\n[Truncated at ${budget} characters. ${hint}]`
    : `\n\n[Truncated at ${budget} characters.]`
  if (notice.length >= budget)
    return budget === 1 ? '…' : `${text.slice(0, budget - 1)}…`
  return text.slice(0, budget - notice.length) + notice
}

export function toolText(text: string): WebMcpToolResult {
  return { content: [{ type: 'text', text }] }
}

export function toolError(message: string): WebMcpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}
