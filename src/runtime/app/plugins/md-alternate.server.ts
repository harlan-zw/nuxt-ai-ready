import { defineNuxtPlugin, useHead, useRequestURL, useRuntimeConfig } from 'nuxt/app'
import { joinURL } from 'ufo'
import { toMarkdownPath } from '../../markdown-path'

export default defineNuxtPlugin({
  setup() {
    const url = useRequestURL()
    const path = url.pathname

    // Skip file-like routes (already have an extension)
    const lastSegment = path.split('/').pop() || ''
    if (lastSegment.includes('.'))
      return

    const runtimeConfig = useRuntimeConfig()
    const describedby = (runtimeConfig['nuxt-ai-ready'] as { describedby?: boolean } | undefined)?.describedby !== false

    useHead({
      link: [
        { rel: 'alternate', type: 'text/markdown', href: toMarkdownPath(path) },
        ...(describedby
          ? [{ rel: 'describedby', href: joinURL(runtimeConfig.app.baseURL, 'llms.txt') } as unknown as { rel: 'alternate', href: string }]
          : []),
      ],
    })
  },
})
