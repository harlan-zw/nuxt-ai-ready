import { defineNitroPlugin, useRuntimeConfig } from '#nuxtseo/nitro'
import { llmsTxtDirectiveHtml } from '../../llms-txt-directive'
import { toDeployedRoute } from '../../route-path'

/** Registered only with `llmsTxt.directive.html: true`. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    html.bodyPrepend.unshift(llmsTxtDirectiveHtml(toDeployedRoute('/llms.txt', useRuntimeConfig(event).app.baseURL)))
  })
})
