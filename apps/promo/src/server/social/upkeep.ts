import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { queueDueHealthChecks } from "./health"
import {
  markDeadSessions,
  reapIdleSessions,
  removeOrphanContainers,
} from "@/server/browser/session"

/**
 * The quick, regular jobs. These ride the shell's one fifteen-second ticker,
 * which is right for them: each is a read and a few outside calls.
 *
 * The slow browser work is deliberately not here. It lives in its own process
 * (`worker/src/social-browser.ts`), because a search takes tens of seconds and
 * would hold up every other app job on the shared ticker. The browser steps
 * below only ever ask Docker. They need no command key and never open or
 * drive a browser, which stays the browser program's job alone.
 */

/**
 * Keeps the browsers honest: closes the idle ones, marks the dead ones, and
 * removes containers nothing claims.
 *
 * Dead before orphans, so a container that crashed and was then cleared away
 * is still recorded as a crash with its reason, rather than vanishing.
 */
export async function reapBrowsers(db: CustomShellDb = defaultDb): Promise<void> {
  const closed = await reapIdleSessions(db)
  if (closed) console.log(`Shut down ${closed} idle browser(s)`)

  const dead = await markDeadSessions(db)
  if (dead) console.log(`Marked ${dead} browser(s) dead`)

  const orphans = await removeOrphanContainers(db)
  if (orphans) console.log(`Removed ${orphans} leftover browser container(s)`)
}

/**
 * Asks for a fresh karma, age and stranger's-eye reading of each signed-in
 * Reddit account once a day. Only writes jobs: the browser program takes the
 * reading, in a tab of its own, so a page a person is using never moves.
 */
export async function queueAccountHealth(db: CustomShellDb = defaultDb): Promise<void> {
  const queued = await queueDueHealthChecks(db)
  if (queued) console.log(`Asked for ${queued} Reddit account health reading(s)`)
}
