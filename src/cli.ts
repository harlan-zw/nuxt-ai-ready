#!/usr/bin/env node
import { existsSync } from 'node:fs'
import fsp from 'node:fs/promises'
import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { colors } from 'consola/utils'
import { join, resolve } from 'pathe'

async function getSecret(cwd: string): Promise<string | null> {
  const secretPath = join(cwd, 'node_modules/.cache/nuxt/ai-ready/secret')
  if (!existsSync(secretPath)) {
    return null
  }
  return fsp.readFile(secretPath, 'utf-8').then(s => s.trim()).catch(() => null)
}

const main = defineCommand({
  meta: {
    name: 'nuxt-ai-ready',
    description: 'Nuxt AI Ready CLI',
  },
  subCommands: {
    status: defineCommand({
      meta: {
        name: 'status',
        description: 'Show indexing status and IndexNow sync progress',
      },
      args: {
        url: {
          type: 'string',
          alias: 'u',
          description: 'Site URL (default: http://localhost:3000)',
          default: 'http://localhost:3000',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
          default: '.',
        },
      },
      async run({ args }) {
        const cwd = resolve((args.cwd as string) || '.')
        const secret = await getSecret(cwd)

        if (!secret) {
          consola.error('No secret found. Run `nuxi dev` or `nuxi build` first to generate one.')
          return
        }

        const url = `${args.url}/__ai-ready/status?secret=${secret}`
        consola.info(`Fetching status from ${args.url}...`)

        const res = await fetch(url)
          .then(r => r.json())
          .catch((err) => {
            consola.error(`Failed to connect: ${err.message}`)
            return null
          })

        if (!res)
          return

        consola.box('AI Ready Status')

        consola.info(`Total pages: ${colors.cyan(res.total?.toString() || '0')}`)
        consola.info(`Indexed: ${colors.green(res.indexed?.toString() || '0')}`)
        consola.info(`Pending: ${colors.yellow(res.pending?.toString() || '0')}`)

        if (res.indexNow) {
          consola.log('')
          consola.info(colors.bold('IndexNow:'))
          consola.info(`  Pending: ${colors.yellow(res.indexNow.pending?.toString() || '0')}`)
          consola.info(`  Total submitted: ${colors.green(res.indexNow.totalSubmitted?.toString() || '0')}`)
          if (res.indexNow.lastSubmittedAt) {
            const date = new Date(res.indexNow.lastSubmittedAt)
            consola.info(`  Last submitted: ${colors.dim(date.toISOString())}`)
          }
          if (res.indexNow.lastError) {
            consola.info(`  Last error: ${colors.red(res.indexNow.lastError)}`)
          }
        }
      },
    }),

    poll: defineCommand({
      meta: {
        name: 'poll',
        description: 'Trigger page indexing',
      },
      args: {
        url: {
          type: 'string',
          alias: 'u',
          description: 'Site URL (default: http://localhost:3000)',
          default: 'http://localhost:3000',
        },
        limit: {
          type: 'string',
          alias: 'l',
          description: 'Max pages to process',
          default: '10',
        },
        all: {
          type: 'boolean',
          alias: 'a',
          description: 'Process all pending pages',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
          default: '.',
        },
      },
      async run({ args }) {
        const cwd = resolve((args.cwd as string) || '.')
        const secret = await getSecret(cwd)

        if (!secret) {
          consola.error('No secret found. Run `nuxi dev` or `nuxi build` first.')
          return
        }

        const params = new URLSearchParams({ secret })
        if (args.all) {
          params.set('all', 'true')
        }
        else {
          params.set('limit', (args.limit as string) || '10')
        }

        const url = `${args.url}/__ai-ready/poll?${params}`
        consola.info(`Triggering poll at ${args.url}...`)

        const res = await fetch(url, { method: 'POST' })
          .then(r => r.json())
          .catch((err) => {
            consola.error(`Failed: ${err.message}`)
            return null
          })

        if (!res)
          return

        consola.success(`Indexed: ${colors.green(res.indexed?.toString() || '0')} pages`)
        consola.info(`Remaining: ${colors.yellow(res.remaining?.toString() || '0')}`)
        if (res.errors?.length) {
          consola.warn(`Errors: ${res.errors.length}`)
        }
        if (res.duration) {
          consola.info(`Duration: ${colors.dim(`${res.duration}ms`)}`)
        }
      },
    }),

    restore: defineCommand({
      meta: {
        name: 'restore',
        description: 'Restore database from prerendered dump',
      },
      args: {
        url: {
          type: 'string',
          alias: 'u',
          description: 'Site URL (default: http://localhost:3000)',
          default: 'http://localhost:3000',
        },
        clear: {
          type: 'boolean',
          description: 'Clear existing pages first (default: true)',
          default: true,
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
          default: '.',
        },
      },
      async run({ args }) {
        const cwd = resolve((args.cwd as string) || '.')
        const secret = await getSecret(cwd)

        if (!secret) {
          consola.error('No secret found. Run `nuxi dev` or `nuxi build` first.')
          return
        }

        const params = new URLSearchParams({ secret })
        if (!args.clear) {
          params.set('clear', 'false')
        }

        const url = `${args.url}/__ai-ready/restore?${params}`
        consola.info(`Restoring database at ${args.url}...`)

        const res = await fetch(url, { method: 'POST' })
          .then(r => r.json())
          .catch((err) => {
            consola.error(`Failed: ${err.message}`)
            return null
          })

        if (!res)
          return

        consola.success(`Restored: ${colors.green(res.restored?.toString() || '0')} pages`)
        if (res.cleared) {
          consola.info(`Cleared: ${colors.yellow(res.cleared?.toString() || '0')} existing pages`)
        }
      },
    }),

    prune: defineCommand({
      meta: {
        name: 'prune',
        description: 'Remove stale routes from database',
      },
      args: {
        url: {
          type: 'string',
          alias: 'u',
          description: 'Site URL (default: http://localhost:3000)',
          default: 'http://localhost:3000',
        },
        dry: {
          type: 'boolean',
          alias: 'd',
          description: 'Preview without deleting',
        },
        ttl: {
          type: 'string',
          description: 'Override pruneTtl config',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
          default: '.',
        },
      },
      async run({ args }) {
        const cwd = resolve((args.cwd as string) || '.')
        const secret = await getSecret(cwd)

        if (!secret && !args.dry) {
          consola.error('No secret found. Run `nuxi dev` or `nuxi build` first.')
          return
        }

        const params = new URLSearchParams()
        if (secret)
          params.set('secret', secret)
        if (args.dry)
          params.set('dry', 'true')
        if (args.ttl)
          params.set('ttl', args.ttl as string)

        const url = `${args.url}/__ai-ready/prune?${params}`
        consola.info(`${args.dry ? 'Previewing' : 'Pruning'} stale routes at ${args.url}...`)

        const res = await fetch(url, { method: 'POST' })
          .then(r => r.json())
          .catch((err) => {
            consola.error(`Failed: ${err.message}`)
            return null
          })

        if (!res)
          return

        if (args.dry) {
          consola.info(`Would prune: ${colors.yellow(res.count?.toString() || '0')} routes`)
          if (res.routes?.length) {
            for (const route of res.routes.slice(0, 20)) {
              consola.log(`  ${colors.dim('•')} ${route}`)
            }
            if (res.routes.length > 20) {
              consola.log(`  ${colors.dim(`... and ${res.routes.length - 20} more`)}`)
            }
          }
        }
        else {
          consola.success(`Pruned: ${colors.green(res.pruned?.toString() || '0')} routes`)
        }
      },
    }),

    indexnow: defineCommand({
      meta: {
        name: 'indexnow',
        description: 'Trigger IndexNow sync',
      },
      args: {
        url: {
          type: 'string',
          alias: 'u',
          description: 'Site URL (default: http://localhost:3000)',
          default: 'http://localhost:3000',
        },
        limit: {
          type: 'string',
          alias: 'l',
          description: 'Max URLs to submit',
          default: '100',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
          default: '.',
        },
      },
      async run({ args }) {
        const cwd = resolve((args.cwd as string) || '.')
        const secret = await getSecret(cwd)

        if (!secret) {
          consola.error('No secret found. Run `nuxi dev` or `nuxi build` first.')
          return
        }

        const params = new URLSearchParams({
          secret,
          limit: (args.limit as string) || '100',
        })

        const url = `${args.url}/__ai-ready/indexnow?${params}`
        consola.info(`Triggering IndexNow sync at ${args.url}...`)

        const res = await fetch(url, { method: 'POST' })
          .then(r => r.json())
          .catch((err) => {
            consola.error(`Failed: ${err.message}`)
            return null
          })

        if (!res)
          return

        if (res.success) {
          consola.success(`Submitted: ${colors.green(res.submitted?.toString() || '0')} URLs`)
          consola.info(`Remaining: ${colors.yellow(res.remaining?.toString() || '0')}`)
        }
        else {
          consola.error(`Failed: ${res.error || 'Unknown error'}`)
        }
      },
    }),
  },
})

runMain(main)
