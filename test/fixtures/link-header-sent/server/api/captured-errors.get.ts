import { defineEventHandler } from '#nuxtseo/h3'

// Drains the list, so each request reports only errors since the last one.
export default defineEventHandler(() => (((globalThis as any).__aiReadyCapturedErrors || []) as string[]).splice(0))
