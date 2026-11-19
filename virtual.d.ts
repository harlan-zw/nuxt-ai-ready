// Type declarations for virtual modules
interface PageDataEntry {
  route: string
  title: string
  description: string
  headings: string
  updatedAt: string
  markdown: string
}

declare module '#ai-ready-virtual/read-page-data.mjs' {
  export function readPageDataFromFilesystem(): Promise<{
    pages: PageDataEntry[]
    errorRoutes: string[]
  }>
}

declare module '#ai-ready-virtual/page-data.mjs' {
  export const pages: PageDataEntry[]
  export const errorRoutes: string[]
}

declare module '#ai-ready-virtual/cloudflare-fallback-paths.mjs' {
  const paths: ReadonlySet<string>
  export default paths
}

declare module '#ai-ready-virtual/prerendered-markdown-headers.mjs' {
  const headers: ReadonlyMap<string, Readonly<Record<string, string>>>
  export default headers
}
