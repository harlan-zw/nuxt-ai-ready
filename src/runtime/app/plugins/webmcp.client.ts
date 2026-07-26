import type { ModuleAppRuntimeConfig } from '../../../module'
import type { WebMcpRegisterOptions } from '../../webmcp'
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app'
import { getModelContext, registerTool } from '../../webmcp'
import { createSiteTools } from '../../webmcp-site-tools'

export default defineNuxtPlugin({
  name: 'nuxt-ai-ready:webmcp',
  setup() {
    const modelContext = getModelContext()
    if (!modelContext)
      return

    const { webmcp } = useRuntimeConfig().public['nuxt-ai-ready'] as ModuleAppRuntimeConfig

    // Omit exposedTo unless it holds origins: runtime config round-trips an
    // unset value as null, which WebIDL cannot convert to a sequence.
    const options: WebMcpRegisterOptions = {}
    if (webmcp.exposedTo?.length)
      options.exposedTo = webmcp.exposedTo

    // Static registration: tools stay available for the whole document, the
    // work only happens when an agent calls one.
    for (const tool of createSiteTools(webmcp))
      registerTool(modelContext, tool, options)
  },
})
