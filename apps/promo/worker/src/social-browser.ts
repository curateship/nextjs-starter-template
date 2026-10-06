/**
 * The social browser, as its own program.
 *
 * One program for every network, not one each. A job names the network it
 * belongs to, and the browser container's routines are keyed the same way, so
 * Instagram's jobs ride this loop the day they exist.
 *
 * **Why it is not on the shell's ticker.** A search through a real browser
 * takes tens of seconds: the page has to load, Reddit's JavaScript challenge
 * has to be solved, and the reply list has to come back. The shell's one
 * background pass fires every fifteen seconds and runs every app's jobs in
 * turn, so putting a browser search on it would hold up everything else in the
 * app for a minute at a time.
 *
 * So the slow work lives here and the two talk through `promo_jobs`. The
 * screen writes a row and returns; this claims it and does the work. The
 * shell's ticker keeps only the quick jobs that ask Docker and need no key:
 * sweeping proxy health, shutting down a browser nobody has used for an hour,
 * marking a dead one, and removing containers nothing claims.
 *
 * **The only program that opens, drives or closes a browser.** Opening one
 * hands this process the command key, kept in its memory and nowhere else.
 * When the site opened browsers too, each program closed the other's as one
 * it held no key for, so signing in from Settings and then pressing Search
 * closed the browser that had just been signed in. Now a dashboard writes an
 * `open`, `close` or `check` job and reads the rows this writes.
 *
 * **Several profiles at once.** Jobs for one profile run one at a time and
 * in order, because a browser has one page and one driver. Jobs for different
 * profiles run side by side, one lane each, up to the limit on open browsers
 * set in Settings, so a two-minute comment on one profile no longer holds up a
 * search on another. The claim itself skips a profile with a job running (see
 * `claimNextJob`), so this only decides how many to run at once.
 *
 * **Two copies are safe.** A job is claimed under a lock every copy shares,
 * so two copies cannot both start work on one profile. What is *not* safe
 * twice is the browser itself, and that is held to one by a unique index on
 * the browser profile rather than by hoping only one of these is running.
 *
 * Start it with `npm run social:browser`, built by `npm run build:social-browser`.
 */

import { randomUUID } from "node:crypto"

import { readBrowserSettings } from "@/server/browser/settings"
import { runOneJob } from "@/server/social/runner"

/**
 * How long a lane waits when there was nothing to do.
 *
 * Measured from the end of a turn, not the start, so a slow browser delays the
 * next look instead of stacking turns on top of each other. After a job is
 * done the next look is immediate, because a person who pressed Search twice
 * should not wait five seconds between them.
 */
const IDLE_GAP_MS = 5_000

/**
 * How often the number of lanes is matched to the limit in Settings, so a
 * raised limit is used within this long without a restart.
 */
const SETTINGS_GAP_MS = 15_000

/** This process's name on every claim it makes, for the whole run. */
const claimToken = randomUUID()

let stopping = false
let wanted = 1
let settingsTimer: ReturnType<typeof setTimeout> | null = null

/** Running lanes by number, each a promise that settles when it ends. */
const lanes = new Map<number, Promise<void>>()

/** Wakes every lane waiting out an idle gap, so a stop is not held up by one. */
const wakers = new Set<() => void>()

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer)
      wakers.delete(wake)
      resolve()
    }
    const timer = setTimeout(wake, ms)
    wakers.add(wake)
  })
}

/** One job: claim, run, log. Returns whether there was one. */
async function turn(): Promise<boolean> {
  try {
    const result = await runOneJob(claimToken)
    if (result.did === "nothing") return false
    if (result.ok) {
      console.log(`Finished ${result.kind} job ${result.jobId}`)
    } else {
      // The job row already carries this message and the screen shows it.
      // Logging it too is what makes a failure findable after the fact.
      console.error(`Failed ${result.kind} job ${result.jobId}: ${result.error}`)
    }
    return true
  } catch (error) {
    // Nothing inside `runOneJob` is supposed to reach here: it records its
    // own failures. If something does, the lane still has to survive it, or
    // one bad job stops the browser for good.
    console.error("A browser turn threw", error)
    return true
  }
}

/**
 * One lane: straight on to the next job while there is work, then back to
 * waiting. A lane numbered past a lowered limit ends after its job, so a
 * lower limit never stops work part-way.
 */
async function lane(index: number): Promise<void> {
  while (!stopping && index < wanted) {
    const didWork = await turn()
    if (!didWork && !stopping) await pause(IDLE_GAP_MS)
  }
  lanes.delete(index)
}

/** Reads the limit and starts any lane it now allows. */
async function matchLanes(): Promise<void> {
  try {
    wanted = (await readBrowserSettings()).maxOpen
  } catch (error) {
    // Keeps the lanes it has; the next look tries again.
    console.error("Could not read the browser settings", error)
  }
  for (let index = 0; index < wanted && !stopping; index += 1) {
    if (!lanes.has(index)) lanes.set(index, lane(index))
  }
  if (!stopping) settingsTimer = setTimeout(() => void matchLanes(), SETTINGS_GAP_MS)
}

/**
 * Stop taking new work and let every job in flight finish.
 *
 * A job claimed but not finished when this goes follows the same stale-claim
 * rule as a container that was killed outright: it is handed back after ten
 * minutes, and given up after three goes. A comment is never handed back.
 */
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.log(`Social browser stopping on ${signal}, waiting for ${lanes.size} lanes`)

  if (settingsTimer) clearTimeout(settingsTimer)
  for (const wake of [...wakers]) wake()
  await Promise.allSettled([...lanes.values()])

  console.log("Social browser stopped")
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

console.log(
  `Social browser started as ${claimToken}, one lane per open browser the limit allows, each looking every ${
    IDLE_GAP_MS / 1000
  }s when idle`
)
void matchLanes()
