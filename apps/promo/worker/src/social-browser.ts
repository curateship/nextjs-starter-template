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
 * **Two copies are safe.** A job is claimed with `FOR UPDATE SKIP LOCKED`
 * before any work starts, so a second copy steps over a row the first is
 * taking rather than doing it twice. What is *not* safe twice is the browser
 * itself, and that is held to one by a unique index on the browser profile
 * rather than by hoping only one of these is running.
 *
 * Start it with `npm run social:browser`, built by `npm run build:social-browser`.
 */

import { randomUUID } from "node:crypto"

import { runOneJob } from "@/server/social/runner"

/**
 * How long to wait when there was nothing to do.
 *
 * Measured from the end of a turn, not the start, so a slow browser delays the
 * next look instead of stacking turns on top of each other. After a job is
 * done the next look is immediate, because a person who pressed Search twice
 * should not wait five seconds between them.
 */
const IDLE_GAP_MS = 5_000

/** This process's name on every claim it makes, for the whole run. */
const claimToken = randomUUID()

let stopping = false
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<unknown> | null = null

function scheduleNext(delayMs: number): void {
  if (stopping) return
  timer = setTimeout(() => {
    void loop()
  }, delayMs)
}

async function loop(): Promise<void> {
  if (stopping) return

  let didWork = false
  inFlight = runOneJob(claimToken)
    .then((result) => {
      if (result.did === "nothing") return
      didWork = true
      if (result.ok) {
        console.log(`Finished ${result.kind} job ${result.jobId}`)
      } else {
        // The job row already carries this message and the screen shows it.
        // Logging it too is what makes a failure findable after the fact.
        console.error(`Failed ${result.kind} job ${result.jobId}: ${result.error}`)
      }
    })
    .catch((error) => {
      // Nothing inside `runOneJob` is supposed to reach here: it records its
      // own failures. If something does, the loop still has to survive it, or
      // one bad job stops the browser for good.
      console.error("A browser turn threw", error)
    })

  try {
    await inFlight
  } finally {
    inFlight = null
  }

  // Straight on to the next job while there is work, then back to waiting.
  scheduleNext(didWork ? 0 : IDLE_GAP_MS)
}

/**
 * Stop taking new work and let the turn in flight finish.
 *
 * A job claimed but not finished when this goes follows the same stale-claim
 * rule as a container that was killed outright: it is handed back after five
 * minutes, and given up after three goes.
 */
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.log(`Social browser stopping on ${signal}`)

  if (timer) clearTimeout(timer)
  await inFlight?.catch(() => {})

  console.log("Social browser stopped")
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

console.log(
  `Social browser started as ${claimToken}, looking for work now and then every ${
    IDLE_GAP_MS / 1000
  }s when idle`
)
void loop()
