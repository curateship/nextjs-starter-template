/**
 * The app's background work, as its own program.
 *
 * **Why it is not part of the website.** The web server has no boot hook, so
 * its background loop only starts once a request has arrived — which means a
 * freshly deployed app with nobody looking at it may never run a due
 * automation or send a scheduled newsletter at all. This starts on its own,
 * does a pass immediately, and keeps going whether or not anyone is on the
 * site and whether or not the web container is being replaced.
 *
 * It runs the same jobs the dev server's ticker runs — `runBackgroundPass` in
 * `src/server/background-pass.ts` — imported, never copied. That includes the
 * app's own workers registered through `appBackgroundWorkers()`, so an app
 * copied from this shell gets its jobs run here without touching this file.
 *
 * **Two copies are safe.** Every job claims its work in the database before
 * doing it, so an old worker and its replacement overlapping during a deploy
 * cannot both process the same run. That is what makes it safe to start the
 * new container before the old one goes away. It is *not* a substitute for a
 * job that genuinely must be single — Trade's trading engine takes an
 * exclusive lock of its own, and stays its own program.
 *
 * Start it with `node worker/dist/worker.mjs`, built by `npm run build:worker`.
 */

import { runBackgroundPass } from "@/server/background-pass"
import { heartbeatFile, writeHeartbeat } from "@/server/worker-heartbeat"

/**
 * How long to wait after one pass finishes before starting the next.
 *
 * The gap is measured from the end of a pass rather than the start, so a slow
 * pass delays the next one instead of stacking on top of it. Claims make an
 * overlap harmless, but not piling up is simpler to reason about and simpler
 * to shut down.
 */
const PASS_EVERY_MS = 15_000

let stopping = false
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<void> | null = null

async function onePass(): Promise<void> {
  // `runBackgroundPass` catches each job's failure itself and never rejects,
  // so this is only about the pass ending — not about it going well.
  const { failed } = await runBackgroundPass()

  // The beat says the loop is moving, which is true whether or not a job
  // inside the pass threw. A failing job is the app's problem to fix and is
  // already on stderr; a worker that has stopped going round is a container
  // problem, and that is the only thing the health check should act on.
  await writeHeartbeat().catch((error) => {
    console.error("Could not write the worker heartbeat", error)
  })

  if (failed) {
    console.error(`Background pass finished with ${failed} failed job(s)`)
  }
}

function scheduleNext(): void {
  if (stopping) return
  timer = setTimeout(() => {
    void loop()
  }, PASS_EVERY_MS)
}

async function loop(): Promise<void> {
  if (stopping) return

  inFlight = onePass().catch((error) => {
    // Nothing inside a pass is supposed to reach here. If something does, the
    // loop still has to survive it — a worker that stops on one bad pass is
    // worse than one that logs and tries again in fifteen seconds.
    console.error("Background pass threw", error)
  })

  try {
    await inFlight
  } finally {
    inFlight = null
  }

  scheduleNext()
}

/**
 * Stop taking new work and let the pass in flight finish.
 *
 * Anything claimed but not completed when the process finally goes follows the
 * existing stale-claim rules, exactly as it would if the container had been
 * killed outright — this only reduces how often that happens.
 */
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.log(`Worker stopping on ${signal}`)

  if (timer) clearTimeout(timer)
  await inFlight?.catch(() => {})

  console.log("Worker stopped")
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

// A beat before the first pass, so the health check has an answer during the
// container's start-up window rather than reading a missing file as a failure.
//
// If even this fails the worker cannot ever be called well — the health check
// reads that file and nothing else — so it says why in one line and stops,
// rather than looping forever while looking broken for an unexplained reason.
try {
  await writeHeartbeat()
} catch {
  console.error(
    `Worker cannot start: nothing can be written to ${heartbeatFile()}. Set CUSTOM_SHELL_WORKER_HEARTBEAT to a writable path.`
  )
  process.exit(1)
}

console.log(`Worker started, one pass now and then every ${PASS_EVERY_MS / 1000}s`)
void loop()
