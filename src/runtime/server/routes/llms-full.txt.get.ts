import { eventHandler, setHeader } from 'h3'

// llms-full.txt is streamed during prerender directly to public dir
// This handler only serves a placeholder for non-prerendered requests
export default eventHandler((event) => {
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return '# llms-full.txt\n\nThis file is only available for prerendered routes.\nRun `nuxi generate` to generate this file.'
})
