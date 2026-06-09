import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { logger } from '../../../logger'

/**
 * Ensure the directory for a file-based SQLite database exists and is writable,
 * returning the path to actually open.
 *
 * On a read-only filesystem (read-only Docker container, serverless bundle) the
 * configured directory cannot be created. Rather than crash every request, fall
 * back to a writable temp dir so runtime indexing keeps working. The fallback
 * database is ephemeral (lost on restart, not shared across replicas) and is
 * reseeded from the prerendered dump / sitemap on cold start, so this is a safe
 * degradation for the SSR indexing model.
 */
export async function resolveWritableDbPath(dbPath: string): Promise<string> {
  const dir = dirname(dbPath)
  const err = await mkdir(dir, { recursive: true }).then(() => null).catch(e => e)
  if (!err)
    return dbPath

  // Only the read-only / permission cases are recoverable via the temp dir.
  if (err.code !== 'EROFS' && err.code !== 'EACCES')
    throw err

  const fallback = join(tmpdir(), 'ai-ready', 'pages.db')
  await mkdir(dirname(fallback), { recursive: true }).catch((e) => {
    throw new Error(
      `[ai-ready] Database directory '${dir}' is read-only and the temp dir fallback `
      + `('${fallback}') also failed: ${e.message}. Set database.filename to a writable path, `
      + `or use a serverless driver: database.type 'd1' (Cloudflare), 'neon' (Vercel/Postgres), `
      + `or 'libsql' (Turso).`,
    )
  })

  logger.warn(
    `[ai-ready] Database directory '${dir}' is read-only; falling back to '${fallback}'. `
    + `This database is ephemeral and reseeded on cold start. Set database.filename to a `
    + `writable persistent path (or a volume) to silence this warning.`,
  )
  return fallback
}
