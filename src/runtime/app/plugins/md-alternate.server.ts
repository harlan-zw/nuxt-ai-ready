import { defineNuxtPlugin, useError, useHead, useRequestEvent, useRequestURL, useRuntimeConfig } from 'nuxt/app'
import { joinURL } from 'ufo'
import { markdownAlternatePath } from '../../markdown-path'
import { toDeployedRoute, toLogicalRoute } from '../../route-path'

export default defineNuxtPlugin({
  setup() {
    const error = useError()
    if (error.value)
      return

    const url = useRequestURL()
    const runtimeConfig = useRuntimeConfig()
    const baseURL = runtimeConfig.app.baseURL

    // Skip anything the markdown handler declines: a reserved namespace
    // (including `/__nuxt_error`), or a route that already carries an extension.
    const markdownLogicalPath = markdownAlternatePath(toLogicalRoute(url.pathname, baseURL))
    if (!markdownLogicalPath)
      return

    const markdownPath = toDeployedRoute(markdownLogicalPath, baseURL)
    const config = runtimeConfig['nuxt-ai-ready'] as { describedby?: boolean, zeroRuntimeMarkdown?: boolean } | undefined
    const describedby = config?.describedby !== false
    const markdownAvailable = useRequestEvent()?.context.aiReadyMarkdownAvailable !== false
    const markdownLink = {
      rel: 'alternate' as const,
      type: 'text/markdown',
      href: markdownPath,
      ...(import.meta.prerender && config?.zeroRuntimeMarkdown && { 'data-ai-ready-markdown': '' }),
    }
    const links = [
      ...(markdownAvailable
        ? [markdownLink]
        : []),
      ...(describedby
        ? [
            {
              rel: 'describedby',
              href: joinURL(baseURL, 'llms.txt'),
            } as unknown as { rel: 'alternate', href: string },
          ]
        : []),
    ]
    if (!links.length)
      return

    useHead(() => error.value
      ? {}
      : { link: links })
  },
})
