import { defineNitroPlugin } from 'nitropack/runtime'

const errors: string[] = ((globalThis as any).__aiReadyCapturedErrors ||= [])

// Nitro routes hook failures to the error hook and never logs them.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error) => {
    const code = (error as { code?: string }).code
    errors.push(`${code || 'error'}: ${error.message}`)
  })
})
