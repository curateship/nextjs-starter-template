import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"

/**
 * How the worker says it is still going round, and how its health check finds
 * out.
 *
 * A file rather than a database row, for one reason: the worker is forbidden
 * from changing database structure (it is deployed *after* the web container
 * has already migrated), so it has no table of its own to beat in. A file
 * inside the container is also the truthful scope — it answers "is *this*
 * container's loop moving", which is exactly what a container health check is
 * asked. Whether the database answers is a separate question, and the health
 * command asks it separately.
 */

/**
 * How long a heartbeat may go unrefreshed before the loop counts as stopped.
 *
 * A pass runs every fifteen seconds, so this is eight missed passes. It is
 * deliberately loose: both jobs on the pass work in batches — fifty emails, or
 * twenty automation runs — and a batch of fifty emails through a slow provider
 * is a perfectly healthy pass that simply takes a while. A tight window would
 * kill a worker for doing its job.
 */
export const HEARTBEAT_STALE_MS = 120_000

/**
 * Where the beat is written. Configurable because the health check and the
 * worker are two processes in one container and both have to name the same
 * file; the default is fine unless something else has claimed it.
 */
export function heartbeatFile(): string {
  return (
    process.env.CUSTOM_SHELL_WORKER_HEARTBEAT ||
    path.join(tmpdir(), "custom-shell-worker.heartbeat")
  )
}

/** Say the loop is still going, now. */
export async function writeHeartbeat(at: Date = new Date()): Promise<void> {
  await writeFile(heartbeatFile(), `${at.toISOString()}\n`, "utf8")
}

/**
 * How long ago the loop last said anything, or `null` when it never has —
 * no file, an unreadable one, or one holding something that is not a time.
 */
export async function heartbeatAgeMs(now: number = Date.now()): Promise<number | null> {
  let contents: string
  try {
    contents = await readFile(heartbeatFile(), "utf8")
  } catch {
    return null
  }

  const beat = Date.parse(contents.trim())
  if (Number.isNaN(beat)) return null

  // A clock that moved backwards should read as "just now", not as a negative
  // age that would sail past every staleness check below.
  return Math.max(0, now - beat)
}
