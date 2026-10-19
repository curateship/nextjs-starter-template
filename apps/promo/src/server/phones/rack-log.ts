import { and, eq, isNull } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoRacks } from "./schema"

/**
 * The rack program's own log, shown inside Promo (part 61 of the phone farm)
 * so Tyler never needs a terminal on the Mac the phones plug into.
 *
 * The Log tab asks for it; the next time the rack asks `/api/rack/next` for
 * work, the answer carries `sendLog: true` once, and the rack posts its last
 * 300 lines to `/api/rack/log`, signed like every rack message. The lines
 * wait here, in this process's memory, for the tab to read. Never in the
 * database: a log is stale in a minute and may name a phone's serial, and a
 * restart loses only the copy on screen, which Refresh asks for again.
 */

/** An ask the rack has not answered after this long is forgotten. */
const WANTED_MS = 60_000

/** The rack sends at most this many lines, each cut to this many characters. */
export const LOG_MAX_LINES = 300
export const LOG_MAX_LINE_CHARS = 2_000

type RackLog = {
  /** Until when the log is wanted, or 0 once the rack has been told. */
  wantedUntil: number
  lines: string[]
  /** When the lines arrived, or 0 before the first answer. */
  at: number
}

// On `globalThis` so the dev server's module reloads keep an answer on its way.
const holder = globalThis as unknown as { __promoRackLogs?: Map<string, RackLog> }
const logs = (holder.__promoRackLogs ??= new Map<string, RackLog>())

function logOf(rackId: string): RackLog {
  let log = logs.get(rackId)
  if (!log) {
    log = { wantedUntil: 0, lines: [], at: 0 }
    logs.set(rackId, log)
  }
  return log
}

/** The Log tab asked: the rack is told on its next check for work, within the next 60 seconds. */
export function askForLog(rackId: string, now: number = Date.now()): void {
  logOf(rackId).wantedUntil = now + WANTED_MS
}

/** True once while the log is wanted, so the rack is told exactly one time per ask. */
export function takeLogRequest(rackId: string, now: number = Date.now()): boolean {
  const log = logs.get(rackId)
  if (!log || log.wantedUntil <= now) return false
  log.wantedUntil = 0
  return true
}

/** The rack's answer: its last lines, oldest first, kept until the next answer. */
export function keepLog(rackId: string, lines: string[], now: number = Date.now()): void {
  const log = logOf(rackId)
  log.lines = lines.slice(-LOG_MAX_LINES).map((line) => line.slice(0, LOG_MAX_LINE_CHARS))
  log.at = now
}

/** Forgets every rack's log, for tests. */
export function forgetRackLogsForTests(): void {
  logs.clear()
}

/** True when the rack is the person's own and still connected. */
export async function ownsRack(userId: string, rackId: string, db: CustomShellDb = defaultDb): Promise<boolean> {
  const [rack] = await db
    .select({ id: promoRacks.id })
    .from(promoRacks)
    .where(and(eq(promoRacks.id, rackId), eq(promoRacks.userId, userId), isNull(promoRacks.disconnectedAt)))
    .limit(1)
  return Boolean(rack)
}

/**
 * The lines the rack last sent, with when, or null before it has answered.
 * Only for the rack's own person: a log is never handed to anyone else.
 */
export async function readLog(
  userId: string,
  rackId: string,
  db: CustomShellDb = defaultDb
): Promise<{ lines: string[]; at: Date } | null> {
  if (!(await ownsRack(userId, rackId, db))) throw new Error("That rack does not exist.")
  const log = logs.get(rackId)
  return log && log.at ? { lines: log.lines, at: new Date(log.at) } : null
}
