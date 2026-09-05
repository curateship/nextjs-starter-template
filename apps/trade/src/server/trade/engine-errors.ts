import { randomUUID } from "node:crypto"

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"

import {
  ENGINE_ERROR_FOLD_MS,
  ENGINE_ERROR_KEEP,
  type EngineErrorKind,
  type EngineErrorRow,
} from "@/lib/trade/engine-errors"
import { db, type CustomShellDb } from "@/server/db"
import { scrubSecrets } from "@/server/protocols/scrub"
import { tradeEngineErrors } from "@/server/trade/schema"

/**
 * A history of what the trading engine got wrong, so 3am has an answer.
 *
 * Every error site in the engine used to end at `console.error`. That line
 * goes to the container log, which is thrown away on the next deploy and
 * cannot be read from the app at all, and the newest one alone rode the
 * heartbeat to the Trading engine card. `recordEngineError` replaces the
 * `console.error` call at each of those sites: it prints exactly what it
 * always printed, and writes the same words down with a time.
 *
 * **Recording an error must never become one.** Every write here swallows its
 * own failure. The original line has already been printed by the time the
 * write is attempted, so nothing is lost by the row not landing, and a
 * database that has gone away must not turn one failed pass into two.
 */

/**
 * Print an engine error and keep it.
 *
 * Takes the same arguments `console.error` took, so a site changes from
 * `console.error("Ladder loop failed", error)` to
 * `recordEngineError("ladder-worker", "Ladder loop failed", error)` and the
 * printed line is unchanged.
 */
export function recordEngineError(source: string, ...printed: unknown[]): void {
  console.error(...printed)
  void saveEngineError("error", source, printed)
}

/** The same, for a site that warns rather than fails. */
export function recordEngineWarning(
  source: string,
  ...printed: unknown[]
): void {
  console.warn(...printed)
  void saveEngineError("warning", source, printed)
}

/**
 * One write at a time, and never more than this many waiting.
 *
 * **Folding only works if the writes are in order.** Four sites failing in the
 * same instant all looked the table up before any of them had inserted
 * anything, so four identical rows landed where one row counting four was
 * meant to. They go through a queue for that reason alone.
 *
 * The ceiling is for the database outage. Every write there waits out the
 * five-second connection timeout before failing, so a site firing once a
 * second queues faster than the queue drains, and an hour later the engine is
 * holding an hour of stale lines to replay. Past the ceiling a line is
 * dropped; it has already been printed to the log, which is where it always
 * used to live.
 */
const MOST_WAITING = 50
let waiting = 0
let writing: Promise<void> = Promise.resolve()

/**
 * Write one line down, folding it into the row it repeats.
 *
 * Exported because it is the part worth testing; the two helpers above are the
 * console call plus this. It resolves whatever happens.
 */
export function saveEngineError(
  kind: EngineErrorKind,
  source: string,
  printed: readonly unknown[],
  options: { at?: Date; database?: CustomShellDb } = {}
): Promise<void> {
  if (waiting >= MOST_WAITING) return Promise.resolve()
  waiting += 1
  const done = writing.then(() =>
    writeEngineError(kind, source, printed, options).finally(() => {
      waiting -= 1
    })
  )
  // The queue must survive a write that somehow threw anyway, or one bad
  // moment would stop everything after it from ever being written down.
  writing = done.catch(() => {})
  return done
}

async function writeEngineError(
  kind: EngineErrorKind,
  source: string,
  printed: readonly unknown[],
  {
    at = new Date(),
    database = db,
  }: { at?: Date; database?: CustomShellDb } = {}
): Promise<void> {
  const message = engineErrorMessage(printed)
  if (!message) return
  const where = source.slice(0, 60)

  try {
    const folded = await database
      .update(tradeEngineErrors)
      .set({ times: sql`${tradeEngineErrors.times} + 1`, lastSeenAt: at })
      .where(
        and(
          eq(tradeEngineErrors.source, where),
          eq(tradeEngineErrors.kind, kind),
          eq(tradeEngineErrors.message, message),
          gte(
            tradeEngineErrors.firstSeenAt,
            new Date(at.getTime() - ENGINE_ERROR_FOLD_MS)
          )
        )
      )
      .returning({ id: tradeEngineErrors.id })

    if (folded.length > 0) return

    await database.insert(tradeEngineErrors).values({
      id: randomUUID(),
      kind,
      source: where,
      message,
      times: 1,
      firstSeenAt: at,
      lastSeenAt: at,
    })

    await trimEngineErrors(database)
  } catch {
    // Deliberately silent. See the note at the top of the file: the line has
    // already been printed, and an unreachable database must not turn one
    // failed pass into two.
  }
}

/**
 * Everything a console call was handed, as one sentence a person can read.
 *
 * An `Error` becomes its message; its stack belongs in the container log, not
 * on a settings page. Everything else is described plainly rather than as
 * `[object Object]`. The result goes through the same scrubber the live
 * journal uses, so nothing key-shaped can reach the row.
 */
function engineErrorMessage(printed: readonly unknown[]): string {
  const parts = printed
    .map((part) => describePart(part))
    .filter((part) => part.length > 0)
  if (parts.length === 0) return ""
  // The scrubber owns the length too, so a row here and a row in the live
  // journal are cut off at the same place and by the same rule.
  return scrubSecrets(parts.join(": ").replace(/\s+/g, " ").trim())
}

function describePart(part: unknown): string {
  if (part instanceof Error) return part.message || part.name
  if (typeof part === "string") return part
  if (part === null || part === undefined) return ""
  if (typeof part === "object") {
    try {
      return JSON.stringify(part)
    } catch {
      return "[unreadable]"
    }
  }
  return String(part)
}

/**
 * Drop everything past the newest `ENGINE_ERROR_KEEP` rows.
 *
 * Two statements rather than one `delete ... offset`, because the select is
 * the same index walk the screen makes and normally comes back empty, and
 * because a plain `inArray` delete is a thing anyone can read.
 */
async function trimEngineErrors(database: CustomShellDb): Promise<void> {
  const doomed = await database
    .select({ id: tradeEngineErrors.id })
    .from(tradeEngineErrors)
    .orderBy(desc(tradeEngineErrors.lastSeenAt), desc(tradeEngineErrors.id))
    .offset(ENGINE_ERROR_KEEP)

  if (doomed.length === 0) return
  await database.delete(tradeEngineErrors).where(
    inArray(
      tradeEngineErrors.id,
      doomed.map((row) => row.id)
    )
  )
}

/** The history the Trading engine screen draws, newest first. */
export async function listEngineErrors(
  database: CustomShellDb = db
): Promise<EngineErrorRow[]> {
  const rows = await database
    .select()
    .from(tradeEngineErrors)
    .orderBy(desc(tradeEngineErrors.lastSeenAt), desc(tradeEngineErrors.id))
    .limit(ENGINE_ERROR_KEEP)

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    source: row.source,
    message: row.message,
    times: row.times,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  }))
}
