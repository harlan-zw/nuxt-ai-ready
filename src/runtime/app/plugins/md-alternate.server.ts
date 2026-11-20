import { defineNuxtPlugin, useHead, useRequestEvent, useRequestURL, useRuntimeConfig } from 'nuxt/app'
import { joinURL } from 'ufo'
import { markdownAlternatePath } from '../../markdown-path'

export default defineNuxtPlugin({
  setup() {
    const url = useRequestURL()
    const path = url.pathname

    // Skip anything the markdown handler declines: a reserved namespace, or a
    // route that already carries an extension.
    const markdownPath = markdownAlternatePath(path)
    if (!markdownPath)
      return

    const runtimeConfig = useRuntimeConfig()
    const config = runtimeConfig['nuxt-ai-ready'] as { describedby?: boolean, zeroRuntimeMarkdown?: boolean } | undefined
    const describedby = config?.describedby !== false
    const markdownAvailable = useRequestEvent()?.context.aiReadyMarkdownAvailable !== false
    const markdownLink = {
      rel: 'alternate' as const,
      type: 'text/markdown',
      href: markdownPath,
      ...(import.meta.prerender && config?.zeroRuntimeMarkdown && { 'data-ai-ready-markdown': '' }),
    }

    useHead({
      link: [
        ...(markdownAvailable ? [markdownLink] : []),
        ...(describedby
          ? [{ rel: 'describedby', href: joinURL(runtimeConfig.app.baseURL, 'llms.txt') } as unknown as { rel: 'alternate', href: string }]
          : []),
      ],
    })
  },
})
