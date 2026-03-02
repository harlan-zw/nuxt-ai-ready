import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineNuxtConfig } from 'nuxt/config'

const rootDir = dirname(fileURLToPath(import.meta.url))

// Clean cache before build for fresh test runs
rmSync(join(rootDir, 'node_modules/.cache/nuxt-seo/ai-ready'), { recursive: true, force: true })

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  hooks: {
    // Test ai-ready:llms-txt hook
    // @ts-expect-error hook registered by nuxt-ai-ready module
    'ai-ready:llms-txt': (payload: { sections: Array<Record<string, unknown>>, notes: string[] }) => {
      console.log('[Hook] ai-ready:llms-txt called')
      payload.sections?.push({
        title: 'Custom Hook Section',
        description: 'This was added by a hook!',
      })
      payload.notes.push('Custom Hook Section (Full)\nThis was added by a hook!')
    },
  },
})
