import type { MdreamOptions } from 'mdream'
import type { MarkdownContext } from '../../../../../src/runtime/types'
import { defineNitroPlugin } from 'nitropack/runtime'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:mdreamConfig' as any, (config: MdreamOptions) => {
    config.filter ||= {}
    config.filter.exclude = [...(config.filter.exclude || []), 'ul']
  })
  nitroApp.hooks.hook('ai-ready:page:markdown' as any, (ctx: MarkdownContext) => {
    ctx.markdown += `\n\nNitro Markdown hook ran (isPrerender: ${ctx.isPrerender}).`
  })
})
