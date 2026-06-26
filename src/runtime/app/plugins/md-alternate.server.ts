import { defineNuxtPlugin, useHead, useRequestURL } from 'nuxt/app'
import { toMarkdownPath } from '../../markdown-path'

export default defineNuxtPlugin({
  setup() {
    const url = useRequestURL()
    const path = url.pathname

    // Skip file-like routes (already have an extension)
    const lastSegment = path.split('/').pop() || ''
    if (lastSegment.includes('.'))
      return

    useHead({
      link: [
        { rel: 'alternate', type: 'text/markdown', href: toMarkdownPath(path) },
      ],
    })
  },
})
