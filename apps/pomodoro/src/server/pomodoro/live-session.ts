import { and, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { focusSessions } from "@/server/pomodoro/schema"

/**
 * One timer across every device. See `workspace/docs/timer-across-devices.md`.
 *
 * The session row is the truth: its `target_ends_at` while it runs, and its
 * `accumulated_seconds` while it is paused. Every open page works the
 * countdown out from those and the server's clock, the way rooms already do.
 * Pause and resume do their arithmetic here, against the server's clock,
 * rather than trusting whichever device pressed the button.
 */

/** What a page needs to draw somebody's live session. */
export type LiveSession = {
  id: string
  mode: "focus" | "short" | "long"
  status: "running" | "paused"
  plannedSeconds: number
  accumulatedSeconds: number
  targetEndsAt: Date | null
  taskId: string | null
}

/**
 * How long past its end a running session is still picked up. Long enough
 * for a phone that was asleep through the end to finish it on waking; short
 * enough that a session left running days ago never lands in today's count.
 */
const RUNNING_GRACE_MS = 60 * 60_000

/** How long a paused session waits to be picked up again on another device. */
const PAUSED_KEPT_MS = 24 * 60 * 60_000

const liveColumns = {
  id: focusSessions.id,
  mode: focusSessions.mode,
  status: focusSessions.status,
  plannedSeconds: focusSessions.plannedSeconds,
  accumulatedSeconds: focusSessions.accumulatedSeconds,
  targetEndsAt: focusSessions.targetEndsAt,
  taskId: focusSessions.taskId,
}

function asLive(row: {
  id: string
  mode: string
  status: string
  plannedSeconds: number
  accumulatedSeconds: number
  targetEndsAt: Date | null
  taskId: string | null
}): LiveSession {
  return {
    ...row,
    mode: row.mode as LiveSession["mode"],
    status: row.status as LiveSession["status"],
  }
}

/**
 * The account's live session, or null.
 *
 * Starting a session ends any other, so normally there is one. Older rows can
 * still be live: from two devices starting at the same instant, and from
 * before sessions followed you across devices, when reloading the page lost
 * the timer and left its row paused. The newest wins and the rest are
 * cancelled here, or throwing the newest away would bring an old one back
 * on every screen.
 */
export async function readLiveSession(
  userId: string,
  now = new Date(),
  database: CustomShellDb = db
): Promise<LiveSession | null> {
  const rows = await database
    .select(liveColumns)
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        or(
          and(
            eq(focusSessions.status, "running"),
            gt(
              focusSessions.targetEndsAt,
              new Date(now.getTime() - RUNNING_GRACE_MS)
            )
          ),
          and(
            eq(focusSessions.status, "paused"),
            gt(focusSessions.updatedAt, new Date(now.getTime() - PAUSED_KEPT_MS))
          )
        )
      )
    )
    .orderBy(desc(focusSessions.updatedAt), desc(focusSessions.createdAt))
  const [newest] = rows
  if (!newest) return null
  if (rows.length > 1) await cancelOtherLiveSessions(userId, newest.id, database)
  return asLive(newest)
}

/**
 * What became of a session this device was showing and the server no longer
 * calls live: finished somewhere else, or cancelled. Only the owner's own row
 * answers.
 */
export async function readSessionEnding(
  userId: string,
  sessionId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ status: focusSessions.status, mode: focusSessions.mode })
    .from(focusSessions)
    .where(and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)))
    .limit(1)
  return row ?? null
}

/**
 * Pauses a running session, counting what was spent from the row's own end
 * time on the server's clock. Null when the session is not running any more,
 * which means another device acted first; the caller reads the live session
 * again rather than reporting an error.
 */
export async function pauseLiveSession(
  userId: string,
  sessionId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .update(focusSessions)
    .set({
      status: "paused",
      accumulatedSeconds: sql`greatest(0, least(${focusSessions.plannedSeconds},
        ${focusSessions.plannedSeconds} - ceil(extract(epoch from (${focusSessions.targetEndsAt} - now())))::int))`,
      targetEndsAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(focusSessions.id, sessionId),
        eq(focusSessions.userId, userId),
        eq(focusSessions.status, "running")
      )
    )
    .returning(liveColumns)
  return row ? asLive(row) : null
}

/** Resumes a paused session from what it had left. Null as for pausing. */
export async function resumeLiveSession(
  userId: string,
  sessionId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .update(focusSessions)
    .set({
      status: "running",
      targetEndsAt: sql`now() + make_interval(secs => greatest(1,
        ${focusSessions.plannedSeconds} - ${focusSessions.accumulatedSeconds}))`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(focusSessions.id, sessionId),
        eq(focusSessions.userId, userId),
        eq(focusSessions.status, "paused")
      )
    )
    .returning(liveColumns)
  return row ? asLive(row) : null
}

/**
 * Ends the account's other live sessions, keeping one: the last action wins.
 * Without this, starting on the phone while the desk still had a focus
 * running would leave two sessions counting down at once.
 *
 * `onlyOlderThan` is for a new start: it ends only sessions created before
 * it. Two devices starting at the same instant could otherwise each cancel
 * the other's new session and leave none; this way the later one survives.
 */
export async function cancelOtherLiveSessions(
  userId: string,
  keepSessionId: string,
  database: CustomShellDb = db,
  onlyOlderThan?: Date
) {
  await database
    .update(focusSessions)
    .set({ status: "cancelled", targetEndsAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(focusSessions.userId, userId),
        ne(focusSessions.id, keepSessionId),
        inArray(focusSessions.status, ["running", "paused"]),
        onlyOlderThan ? lt(focusSessions.createdAt, onlyOlderThan) : undefined
      )
    )
}
