export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/html')
  setHeader(event, 'cache-control', 'private, no-store')
  return '<html><head><title>Account</title></head><body><h1>Private account</h1></body></html>'
})
import { defineEventHandler, setHeader } from 'h3'
