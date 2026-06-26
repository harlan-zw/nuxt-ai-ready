import { isPathFile } from 'nuxt-site-config/urls'
import { defineNuxtPlugin, prerenderRoutes } from 'nuxt/app'
import { toMarkdownPath } from '../../markdown-path'

export default defineNuxtPlugin({
  setup(nuxtApp) {
    if (!import.meta.prerender) {
      return
    }
    nuxtApp.hooks.hook('app:rendered', (ctx) => {
      const url = ctx.ssrContext?.url || ''
      if (isPathFile(url) || ctx.ssrContext?.error || ctx.ssrContext?.noSSR) {
        return
      }
      prerenderRoutes(toMarkdownPath(url))
    })
  },
})
