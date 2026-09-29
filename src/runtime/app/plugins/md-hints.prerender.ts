import { defineNuxtPlugin, prerenderRoutes } from 'nuxt/app'
import { markdownAlternatePath } from '../../markdown-path'

export default defineNuxtPlugin({
  setup(nuxtApp) {
    if (!import.meta.prerender) {
      return
    }
    nuxtApp.hooks.hook('app:rendered', (ctx) => {
      const url = ctx.ssrContext?.url || ''
      const markdownPath = markdownAlternatePath(url)
      if (!markdownPath || ctx.ssrContext?.error || ctx.ssrContext?.noSSR) {
        return
      }
      prerenderRoutes(markdownPath)
    })
  },
})
