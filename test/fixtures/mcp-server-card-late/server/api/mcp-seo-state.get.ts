import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

export default defineEventHandler(event => ({
  mcp: useRuntimeConfig(event).mcpSeoProFeature,
}))
