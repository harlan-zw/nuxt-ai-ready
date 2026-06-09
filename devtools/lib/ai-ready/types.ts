import type { InjectionKey, Ref } from 'vue'

export interface DevtoolsConfig {
  database: { type: string }
  runtimeSync: { enabled: boolean, ttl: number, batchSize: number, pruneTtl: number }
  indexNow: boolean
  sitemapPrerendered: boolean
  markdownCacheHeaders: { maxAge: number, swr: boolean }
  llmsTxtCacheSeconds: number
  contentSignal: false | { aiTrain: boolean, search: boolean, aiInput: boolean }
  mcp: { enabled: boolean, tools: boolean, resources: boolean }
  cron: boolean
}

export interface LlmsTxtLink {
  title: string
  description?: string
  href: string
}

export interface LlmsTxtSection {
  title: string
  description?: string | string[]
  links?: LlmsTxtLink[]
}

export interface LlmsTxtConfig {
  sections?: LlmsTxtSection[]
  notes?: string | string[]
}

export interface PageSummary {
  route: string
  title: string
  description: string
  updatedAt: string | null
}

export interface DevtoolsGlobalData {
  version: string
  siteConfigUrl: string
  isDev: boolean
  config: DevtoolsConfig
  llmsTxt: LlmsTxtConfig
  stats?: {
    total: number
    indexed: number
    pending: number
    errors: number
  }
  pages?: PageSummary[]
}

export const GlobalDataKey: InjectionKey<Ref<DevtoolsGlobalData | null | undefined>> = Symbol('GlobalData')
export const GlobalDataStatusKey: InjectionKey<Ref<string>> = Symbol('GlobalDataStatus')
