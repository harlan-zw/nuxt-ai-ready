import { readFile } from 'node:fs/promises'
import { resolveCloudflareStaticHeaders } from '../../helpers/cloudflare-headers.ts'

// `nuxt generate` runs the Nitro 3 prerenderer, which converts every page with
// mdream's native binding. A binding that cannot load fails the whole build.
async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

const markdown = await read('.output/public/index.md')
if (!markdown.includes('# Nuxt 5 compatibility'))
  throw new Error(`Unexpected prerendered Markdown: ${markdown}`)

const llmsFull = await read('.output/public/llms-full.txt')
if (!llmsFull.includes('Nuxt 5 compatibility'))
  throw new Error(`llms-full.txt is missing the index page: ${llmsFull}`)

const headers = resolveCloudflareStaticHeaders(await read('.output/_headers'), '/index.md')
if (headers['content-signal'] !== 'ai-train=no' || !headers.link?.includes('rel="canonical"'))
  throw new Error(`Static Markdown lost its headers: ${JSON.stringify(headers)}`)
