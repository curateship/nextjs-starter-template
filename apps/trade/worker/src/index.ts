/**
 * The trading engine, as its own program.
 *
 * **Why it is not part of the website.** The thing that decides whether a rung
 * buys or a stop fires has to be running whether or not anybody is looking at
 * a page, and it must not stop because the site is being deployed or has
 * fallen over. Ladders used to be driven by the trade screen's poll: close the
 * tab and nothing happened, with real money in the trade.
 *
 * It runs the same strategy code as everything else — `smart-ladders.ts`,
 * `smart-orders.ts`, `paper.ts` — imported, never copied. The backtest replays
 * those same files. One strategy, three callers.
 *
 * **Only one copy ever trades.** It takes a lock in the database before doing
 * anything, and a second copy sits as a standby and asks again later. Two
 * copies would not be twice as fast, they would be twice the position.
 *
 * Start it with `node worker/dist/trade.mjs`, built by
 * `npm run build:worker`.
 */

import { randomUUID } from "node:crypto"
import { hostname } from "node:os"

import {
  advanceWorkingLadders,
  lastPass,
} from "@/server/trade/ladder-worker"
import { listProtocols } from "@/server/protocols/registry"
import { tryBecomeLeader, type Leadership } from "@/server/trade/leadership"
import { writeHeartbeat } from "@/server/trade/workers"

/** How often the ladders are worked once this copy is the one trading. */
const PASS_EVERY_MS = 1_000

/** How often a standby asks whether the leader has gone. */
const STANDBY_RETRY_MS = 5_000

/**
 * How often this copy says it is still alive.
 *
 * Well inside the window the Workers screen treats as alive, so one missed
 * beat — a slow database moment — does not make a healthy engine look dead.
 */
const HEARTBEAT_EVERY_MS = 5_000

const WORKER_ID = randomUUID()
const STARTED_AT = Date.now()

let leadership: Leadership | null = null
let loop: ReturnType<typeof setInterval> | null = null
let beat: ReturnType<typeof setInterval> | null = null
let stopping = false

/**
 * Say this copy is alive, and what it is doing.
 *
 * Started before the lock is taken, on purpose: a copy waiting its turn is a
 * useful thing to be able to see, and "one leader, two standbys" on the
 * Workers screen is the difference between a spare and a mistake.
 */
async function sayAlive(role: "leader" | "standby"): Promise<void> {
  // One line per exchange that has a pushed-price hub at all, whatever
  // network it is serving — the heartbeat is about the machinery being up,
  // and mainnet is where the engine's wallets live.
  const feed = listProtocols()
    .filter((protocol) => protocol.livePrices)
    .map((protocol) => {
      const hub = protocol.livePrices!
      const state = hub.fresh("mainnet")
        ? `live, ${hub.read("mainnet").prices.size} markets`
        : "asking"
      return `${protocol.label}: ${state}`
    })
    .join(" · ")
  await writeHeartbeat({
    id: WORKER_ID,
    kind: "ladders",
    startedAt: STARTED_AT,
    role,
    meta: {
      host: `${hostname()} (its own program)`,
      activity: role === "leader" ? lastPass.activity : "Waiting for the lock",
      error: lastPass.error,
      priceFeed: role === "leader" ? feed : "Not needed while waiting",
      wallets: lastPass.wallets,
    },
  }).catch((error) => {
    // A beat that cannot be written is not a reason to stop trading. It makes
    // the screen say "not running", which is the honest answer to a database
    // this process cannot reach.
    console.error("trade worker: heartbeat failed", error)
  })
}

async function becomeLeaderOrWait(): Promise<void> {
  while (!stopping) {
    const taken = await tryBecomeLeader().catch((error) => {
      console.error("trade worker: could not reach the database", error)
      return null
    })
    if (taken?.held) {
      leadership = taken
      return
    }
    // Somebody else is trading. Nothing to do but ask again — the lock is
    // released the moment their process ends, however it ends.
    await new Promise((done) => setTimeout(done, STANDBY_RETRY_MS))
  }
}

/**
 * Work the ladders every second until the lock is gone.
 *
 * The lock lives on a database connection, and that connection can die —
 * the network path hangs up lines that go quiet, which is what used to kill
 * the whole process at exactly sixty minutes old, every hour. A dead line
 * means the lock is already released and another copy may take it at any
 * moment, so the only safe order is: stop trading first, then go and queue
 * for the lock again.
 */
function workUntilLockLost(): Promise<void> {
  return new Promise((done) => {
    loop = setInterval(() => {
      if (leadership?.lost()) {
        if (loop) clearInterval(loop)
        loop = null
        const gone = leadership
        leadership = null
        void gone?.release().catch(() => {})
        done()
        return
      }
      void advanceWorkingLadders().catch((error) => {
        // A pass that throws is one pass. The next one is a second away and
        // starts from the database, so nothing is carried over from the failure.
        console.error("trade worker: pass failed", error)
      })
    }, PASS_EVERY_MS)
    console.log(`trade worker: ready, working ladders every ${PASS_EVERY_MS}ms`)
  })
}

async function main(): Promise<void> {
  console.log("trade worker: starting")

  // Beating from the very first moment, so a copy that never gets the lock is
  // still visible on the Workers screen instead of looking like nothing.
  let role: "leader" | "standby" = "standby"
  await sayAlive(role)
  beat = setInterval(() => void sayAlive(role), HEARTBEAT_EVERY_MS)

  while (!stopping) {
    console.log("trade worker: waiting for the lock")
    await becomeLeaderOrWait()
    if (stopping) return
    role = "leader"
    console.log("trade worker: holding the lock, this copy is trading")

    await workUntilLockLost()
    if (stopping) return
    role = "standby"
    console.log(
      "trade worker: the lock's database connection dropped, asking for the lock again"
    )
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.log(`trade worker: ${signal}, shutting down`)
  if (loop) clearInterval(loop)
  if (beat) clearInterval(beat)
  // Handing the lock back explicitly means the replacement container starts
  // trading in milliseconds rather than waiting for this socket to time out.
  await leadership?.release().catch(() => {})
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))

await main()
