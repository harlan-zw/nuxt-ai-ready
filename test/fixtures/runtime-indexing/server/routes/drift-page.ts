import { defineEventHandler, setHeader } from 'h3'

// Body text comes from a version the e2e test sets through /api/__drift, so a
// test can change this page's content between two indexes.
export default defineEventHandler((event) => {
  const version = (globalThis as { __driftVersion?: string }).__driftVersion || '1'
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  return `<!doctype html><html><head><title>Drift</title></head><body><main><h1>Drift</h1><p>Content version ${version}.</p></main></body></html>`
})
