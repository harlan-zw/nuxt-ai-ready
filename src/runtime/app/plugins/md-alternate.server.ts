import { defineNuxtPlugin, useHead, useRequestURL, useRuntimeConfig } from 'nuxt/app'
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
    const describedby = (runtimeConfig['nuxt-ai-ready'] as { describedby?: boolean } | undefined)?.describedby !== false

    useHead({
      link: [
        { rel: 'alternate', type: 'text/markdown', href: markdownPath },
        ...(describedby
          ? [{ rel: 'describedby', href: joinURL(runtimeConfig.app.baseURL, 'llms.txt') } as unknown as { rel: 'alternate', href: string }]
          : []),
      ],
    })
  },
})
