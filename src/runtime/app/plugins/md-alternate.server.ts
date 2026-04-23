import { defineNuxtPlugin, useHead, useRequestURL } from 'nuxt/app'

export default defineNuxtPlugin({
  setup() {
    const url = useRequestURL()
    const path = url.pathname

    // Skip file-like routes (already have an extension)
    const lastSegment = path.split('/').pop() || ''
    if (lastSegment.includes('.'))
      return

    const mdPath = path === '/' ? '/index.md' : `${path.replace(/\/$/, '')}.md`

    useHead({
      link: [
        { rel: 'alternate', type: 'text/markdown', href: mdPath },
      ],
    })
  },
})
