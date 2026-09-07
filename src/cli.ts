#!/usr/bin/env node
import { existsSync } from 'node:fs'
import fsp from 'node:fs/promises'
import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { colors } from 'consola/utils'
import { join, resolve } from 'pathe'
import { readPackageJSON } from 'pkg-types'

async function getSecret(cwd: string): Promise<string | null> {
  const secretPath = join(cwd, 'node_modules/.cache/nuxt/ai-ready/secret')
  if (!existsSync(secretPath)) {
    return null
  }
  return fsp.readFile(secretPath, 'utf-8').then(s => s.trim()).catch(() => {
    // requireSecret reports the missing or unreadable secret with recovery steps.
    return null
  })
}

function authHeaders(secret: string): Record<string, string> {
  return { Authorization: `Bearer ${secret}` }
}

async function requireSecret(cwd: string, hint = ''): Promise<string | null> {
  const secret = await getSecret(cwd)
  if (!secret) {
    consola.error(`No secret found. Run \`nuxi dev\` or \`nuxi build\` first${hint}.`)
  }
  return secret
}

function describeHttpError(status: number, body: unknown): string {
  const error = body as { message?: unknown, statusMessage?: unknown, error?: unknown } | null
  const message = typeof error?.message === 'string' && error.message
    ? error.message
    : typeof error?.statusMessage === 'string' && error.statusMessage
      ? error.statusMessage
      : typeof error?.error === 'string' && error.error
        ? error.error
        : null
  return message ? `${status}: ${message}` : `request failed with status ${status}`
}

async function fetchJson<T = any>(url: string, init: RequestInit, errorLabel = 'Failed'): Promise<T> {
  const r = await fetch(url, init).catch((err) => {
    throw new Error(`${errorLabel}: ${err instanceof Error ? err.message : String(err)}`)
  })
  if (!r.ok) {
    const body = await r.json().catch(() => {
      // Non-JSON error bodies (e.g. an HTML proxy page) carry no message to show.
      return null
    })
    throw new Error(`${errorLabel}: ${describeHttpError(r.status, body)}`)
  }
  return r.json()
}

const main = defineCommand({
  meta: {
    name: 'nuxt-ai-ready',
    description: 'Nuxt AI Ready CLI',
    version: await readPackageJSON(import.meta.url).then(p => p.version || '0.0.0'),
  },
  subCommands: {
    status: () => defineCommand({
      meta: {
        name: 'status',
        description: 'Show indexing status and sync progress',
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
        const cwd = resolve(args.cwd || '.')
        const secret = await requireSecret(cwd, ' to generate one')
        if (!secret)
          return

        const url = `${args.url}/__ai-ready/status`
        consola.info(`Fetching status from ${args.url}...`)

        const res = await fetchJson(url, { headers: authHeaders(secret) }, 'Failed to connect')

        consola.box('AI Ready Status')

        consola.info(`Total pages: ${colors.cyan(res.total?.toString() || '0')}`)
        consola.info(`Indexed: ${colors.green(res.indexed?.toString() || '0')}`)
        consola.info(`Pending: ${colors.yellow(res.pending?.toString() || '0')}`)

        if (res.activity) {
          consola.log('')
          consola.info(colors.bold('Activity:'))
          consola.info(`  Last 1h: ${colors.cyan(res.activity.last1h?.toString() || '0')} pages indexed`)
          consola.info(`  Last 24h: ${colors.cyan(res.activity.last24h?.toString() || '0')} pages indexed`)
          if (res.activity.recentPages?.length) {
            consola.info(`  Recent:`)
            for (const p of res.activity.recentPages.slice(0, 5)) {
              const ago = Date.now() - p.indexedAt
              const agoStr = ago < 60000 ? `${Math.round(ago / 1000)}s` : ago < 3600000 ? `${Math.round(ago / 60000)}m` : `${Math.round(ago / 3600000)}h`
              consola.info(`    ${colors.dim(`${agoStr} ago`)} ${p.route} ${colors.dim(p.title || '')}`)
            }
          }
        }

        if (res.cron) {
          consola.log('')
          consola.info(colors.bold('Cron:'))
          if (res.cron.lock?.held) {
            consola.warn(`  Lock: ${colors.yellow('held')} (${Math.round((res.cron.lock.elapsedMs || 0) / 1000)}s)`)
          }
          if (res.cron.recentRuns?.length) {
            for (const run of res.cron.recentRuns) {
              const status = run.status === 'success' ? colors.green(run.status) : run.status === 'error' ? colors.red(run.status) : colors.yellow(run.status)
              consola.info(`  ${colors.dim(new Date(run.startedAt).toLocaleTimeString())} ${status} ${colors.dim(`${run.durationMs || 0}ms`)} ${run.pagesIndexed ? `${run.pagesIndexed} indexed` : ''}`)
            }
          }
        }

        if (res.sitemaps?.length) {
          consola.log('')
          consola.info(colors.bold('Sitemaps:'))
          for (const s of res.sitemaps) {
            const err = s.errorCount > 0 ? colors.red(` (${s.errorCount} errors)`) : ''
            consola.info(`  ${s.name}: ${colors.cyan(s.urlCount?.toString() || '0')} URLs${err}`)
          }
        }
      },
    }),

    poll: () => defineCommand({
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
        const cwd = resolve(args.cwd || '.')
        const secret = await requireSecret(cwd)
        if (!secret)
          return

        const params = new URLSearchParams()
        if (args.all) {
          params.set('all', 'true')
        }
        else {
          params.set('limit', args.limit || '10')
        }

        const url = `${args.url}/__ai-ready/poll?${params}`
        consola.info(`Triggering poll at ${args.url}...`)

        const res = await fetchJson(url, { method: 'POST', headers: authHeaders(secret) })

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

    restore: () => defineCommand({
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
          description: 'Clear existing pages first',
          default: true,
          negativeDescription: 'Restore without clearing existing pages',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
          default: '.',
        },
      },
      async run({ args }) {
        const cwd = resolve(args.cwd || '.')
        const secret = await requireSecret(cwd)
        if (!secret)
          return

        const params = new URLSearchParams()
        if (!args.clear) {
          params.set('clear', 'false')
        }

        const url = `${args.url}/__ai-ready/restore?${params}`
        consola.info(`Restoring database at ${args.url}...`)

        const res = await fetchJson(url, { method: 'POST', headers: authHeaders(secret) })

        consola.success(`Restored: ${colors.green(res.restored?.toString() || '0')} pages`)
        if (res.cleared) {
          consola.info(`Cleared: ${colors.yellow(res.cleared?.toString() || '0')} existing pages`)
        }
      },
    }),

    prune: () => defineCommand({
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
        const cwd = resolve(args.cwd || '.')
        const secret = await getSecret(cwd)

        if (!secret && !args.dry) {
          consola.error('No secret found. Run `nuxi dev` or `nuxi build` first.')
          return
        }

        const params = new URLSearchParams()
        if (args.dry)
          params.set('dry', 'true')
        if (args.ttl)
          params.set('ttl', args.ttl)

        const url = `${args.url}/__ai-ready/prune?${params}`
        consola.info(`${args.dry ? 'Previewing' : 'Pruning'} stale routes at ${args.url}...`)

        const res = await fetchJson(url, {
          method: 'POST',
          headers: secret ? authHeaders(secret) : undefined,
        })

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

    reindex: () => defineCommand({
      meta: {
        name: 'reindex',
        description: 'Reindex a single route',
      },
      args: {
        route: {
          type: 'positional',
          description: 'Route to reindex (e.g. /about)',
          required: true,
        },
        url: {
          type: 'string',
          alias: 'u',
          description: 'Site URL (default: http://localhost:3000)',
          default: 'http://localhost:3000',
        },
        force: {
          type: 'boolean',
          description: 'Index even when the page is still fresh',
          default: true,
          negativeDescription: 'Skip indexing when the page is still fresh',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
          default: '.',
        },
      },
      async run({ args }) {
        const cwd = resolve(args.cwd || '.')
        const secret = await requireSecret(cwd)
        if (!secret)
          return

        const params = new URLSearchParams()
        params.set('route', args.route)
        if (!args.force)
          params.set('force', 'false')

        const url = `${args.url}/__ai-ready/reindex?${params}`
        consola.info(`Reindexing ${args.route} at ${args.url}...`)

        const res = await fetchJson(url, { method: 'POST', headers: authHeaders(secret) })

        if (res.indexed) {
          consola.success(`Indexed: ${colors.green(res.route)}`)
          if (res.contentChanged !== undefined) {
            consola.info(`Content changed: ${res.contentChanged ? colors.green('yes') : colors.yellow('no')}`)
          }
        }
        else if (res.skipped) {
          consola.info(`Skipped: ${colors.yellow(res.route)} (still fresh)`)
        }
        else {
          throw new Error(`Failed to reindex ${res.route ?? args.route}${res.error ? `: ${res.error}` : ''}`)
        }
      },
    }),

  },
})

runMain(main)
