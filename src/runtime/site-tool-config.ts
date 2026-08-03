export interface McpSiteToolAttachmentOptions {
  /** Attach this tool to the MCP Toolkit server. */
  enabled?: boolean
}

export type WebMcpSiteToolAttachmentOptions
  = | { enabled: false }
    | {
      /** Attach this tool to `document.modelContext`. */
      enabled?: true
      /** Characters a response may return before truncation. */
      maxOutputChars?: number
      /** Trusted origins for this tool. Overrides the WebMCP default. */
      exposedTo?: string[]
    }

export interface SiteToolOptions {
  /** Regular MCP attachment. */
  mcp?: McpSiteToolAttachmentOptions
  /** Browser WebMCP attachment. */
  webmcp?: WebMcpSiteToolAttachmentOptions
}

export interface ListPagesToolOptions extends SiteToolOptions {
  /** Results returned when the caller omits `limit`. */
  defaultLimit?: number
}

export interface SearchPagesToolOptions extends SiteToolOptions {
  /** Results returned when the caller omits `limit`. */
  defaultLimit?: number
}

export type GetPageMarkdownToolOptions = SiteToolOptions

export interface SiteToolsConfig {
  listPages?: ListPagesToolOptions
  searchPages?: SearchPagesToolOptions
  getPageMarkdown?: GetPageMarkdownToolOptions
}

export interface ResolvedMcpSiteToolAttachment {
  enabled: boolean
}

export type ResolvedWebMcpSiteToolAttachment
  = | { enabled: false }
    | {
      enabled: true
      maxOutputChars: number
      exposedTo?: string[]
    }

export interface ResolvedListPagesToolConfig {
  defaultLimit: number
  mcp: ResolvedMcpSiteToolAttachment
  webmcp: ResolvedWebMcpSiteToolAttachment
}

export interface ResolvedSearchPagesToolConfig {
  defaultLimit: number
  mcp: ResolvedMcpSiteToolAttachment
  webmcp: ResolvedWebMcpSiteToolAttachment
}

export interface ResolvedGetPageMarkdownToolConfig {
  mcp: ResolvedMcpSiteToolAttachment
  webmcp: ResolvedWebMcpSiteToolAttachment
}

export interface ResolvedSiteToolsConfig {
  listPages: ResolvedListPagesToolConfig
  searchPages: ResolvedSearchPagesToolConfig
  getPageMarkdown: ResolvedGetPageMarkdownToolConfig
}

export interface ResolvedWebMcpToolOptions {
  maxOutputChars: number
  exposedTo?: string[]
}

export interface ResolvedWebMcpPagedToolOptions extends ResolvedWebMcpToolOptions {
  defaultLimit: number
}

export interface ResolvedWebMcpToolsConfig {
  listPages?: ResolvedWebMcpPagedToolOptions
  searchPages?: ResolvedWebMcpPagedToolOptions
  getPageMarkdown?: ResolvedWebMcpToolOptions
}
