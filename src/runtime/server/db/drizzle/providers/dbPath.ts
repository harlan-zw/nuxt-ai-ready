import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'pathe'
import { logger } from '../../../logger'

// Resolution is stable for the lifetime of the process (the filesystem does not
// flip from writable to read-only mid-run), so memoise per configured path to
// avoid probing on every request.
const resolved = new Map<string, string>()

/**
 * Ensure a directory exists and is actually writable.
 *
 * A recursive `mkdir` succeeding does NOT prove writability: the directory may
 * already exist inside a read-only bundle, in which case `mkdir` is a no-op but
 * a later `new Database()` open-for-write still fails. So probe with a real
 * write. Returns the failing error, or null when the directory is writable.
 */
async function ensureWritableDir(dir: string): Promise<NodeJS.ErrnoException | null> {
  const mkErr = await mkdir(dir, { recursive: true }).then(() => null).catch(e => e)
  if (mkErr)
    return mkErr

  const probe = join(dir, '.ai-ready-write-test')
  const writeErr = await writeFile(probe, '').then(() => null).catch(e => e)
  if (writeErr)
    return writeErr
  // Best-effort cleanup; a failed probe-file removal does not change the fact
  // that the directory is writable, which is all this check establishes.
  await rm(probe, { force: true }).catch(() => null)
  return null
}

function isReadOnly(err: NodeJS.ErrnoException): boolean {
  return err.code === 'EROFS' || err.code === 'EACCES'
}

/**
 * Resolve a writable path for a file-based SQLite database, returning the path
 * to actually open.
 *
 * On a read-only filesystem (read-only Docker container, serverless bundle) the
 * configured directory cannot be written. Rather than crash every request, fall
 * back to a temp dir so runtime indexing keeps working. The fallback is
 * namespaced by a hash of the absolute configured path so unrelated apps sharing
 * the OS temp dir do not open the same SQLite file (the tables are package-global
 * and not namespaced per site). The fallback database is ephemeral and reseeded
 * from the prerendered dump / sitemap on cold start, so this is a safe
 * degradation for the SSR indexing model.
 */
export async function resolveWritableDbPath(dbPath: string): Promise<string> {
  const cached = resolved.get(dbPath)
  if (cached)
    return cached

  const dir = dirname(dbPath)
  const err = await ensureWritableDir(dir)
  if (!err) {
    resolved.set(dbPath, dbPath)
    return dbPath
  }

  // Only the read-only / permission cases are recoverable via the temp dir.
  if (!isReadOnly(err))
    throw err

  const key = createHash('sha256').update(resolve(dbPath)).digest('hex').slice(0, 16)
  const fallbackDir = join(tmpdir(), `ai-ready-${key}`)
  const fallbackErr = await ensureWritableDir(fallbackDir)
  if (fallbackErr) {
    throw new Error(
      `[ai-ready] Database directory '${dir}' is read-only and the temp dir fallback `
      + `('${fallbackDir}') also failed: ${fallbackErr.message}. Set database.filename to a `
      + `writable path, or use a serverless driver: database.type 'd1' (Cloudflare), `
      + `'neon' (Vercel/Postgres), or 'libsql' (Turso).`,
    )
  }

  const fallback = join(fallbackDir, 'pages.db')
  logger.warn(
    `[ai-ready] Database directory '${dir}' is read-only; falling back to '${fallback}'. `
    + `This database is ephemeral and reseeded on cold start. Set database.filename to a `
    + `writable persistent path (or a volume) to silence this warning.`,
  )
  resolved.set(dbPath, fallback)
  return fallback
}
