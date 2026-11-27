import { desc, eq, lt } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { PROGRAM_STALE_MS } from "@/lib/social/job-words"

import { promoBrowserProgram } from "./schema"

/**
 * Whether the browser program is running, as the site can tell it.
 *
 * The program and the site share nothing but the database, and the program
 * can run on another machine or in a container, so it checks in here every
 * 15 seconds rather than through a file or a port. Before this existed,
 * searches sat waiting for a day on 12 Oct 2026 with nothing on screen to say
 * the program had stopped.
 */

export type BrowserProgramState = {
  running: boolean
  /** The newest check-in from any copy, or null when none has ever checked in. */
  seenAt: Date | null
  /** When the copy that checked in last started. */
  startedAt: Date | null
}

/** A copy's check-in: here, and how many jobs it may run side by side. */
export async function checkInBrowserProgram(
  id: string,
  lanes: number,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await db
    .insert(promoBrowserProgram)
    .values({ id, startedAt: now, seenAt: now, lanes })
    .onConflictDoUpdate({ target: promoBrowserProgram.id, set: { seenAt: now, lanes } })
}

/** A copy stopped cleanly, so it no longer counts as running. */
export async function checkOutBrowserProgram(id: string, db: CustomShellDb = defaultDb): Promise<void> {
  await db.delete(promoBrowserProgram).where(eq(promoBrowserProgram.id, id))
}

/**
 * Clears copies that were killed rather than stopped and have not checked in
 * for a day, so the table never grows. Run once as a copy starts.
 */
export async function forgetOldBrowserPrograms(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await db.delete(promoBrowserProgram).where(lt(promoBrowserProgram.seenAt, new Date(now.getTime() - 86_400_000)))
}

export async function readBrowserProgram(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<BrowserProgramState> {
  const [row] = await db
    .select({ seenAt: promoBrowserProgram.seenAt, startedAt: promoBrowserProgram.startedAt })
    .from(promoBrowserProgram)
    .orderBy(desc(promoBrowserProgram.seenAt))
    .limit(1)
  if (!row) return { running: false, seenAt: null, startedAt: null }
  return {
    running: now.getTime() - row.seenAt.getTime() < PROGRAM_STALE_MS,
    seenAt: row.seenAt,
    startedAt: row.startedAt,
  }
}
