// Type declarations for virtual modules
interface PageDataEntry {
  route: string
  title: string
  description: string
  headings: string
  chunkIds: string
  updatedAt: string
  markdown: string
}

declare module '#ai-ready-virtual/read-page-data.mjs' {
  export function readPageDataFromFilesystem(): Promise<PageDataEntry[] | null>
}

declare module '#ai-ready-virtual/page-data.mjs' {
  export const pages: PageDataEntry[]
}
