import { isPathFile } from 'nuxt-site-config/urls'
import { defineNuxtPlugin, prerenderRoutes } from 'nuxt/app'

export default defineNuxtPlugin({
  setup(nuxtApp) {
    if (!import.meta.prerender) {
      return
    }
    nuxtApp.hooks.hook('app:rendered', (ctx) => {
      let url = ctx.ssrContext?.url || ''
      if (isPathFile(url) || ctx.ssrContext?.error || ctx.ssrContext?.noSSR) {
        return
      }
      if (url.endsWith('/')) {
        url = `${url}index.md`
      }
      else {
        url = `${url}.md`
      }
      prerenderRoutes(url)
    })
  },
})
