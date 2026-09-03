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
  onLadderRestartRequest,
} from "@/server/trade/ladder-worker"
import { waitToBecomeLeader, type Leadership } from "@/server/trade/leadership"
import { priceFeedStatus } from "@/server/trade/price-feed-status"
import { writeHeartbeat } from "@/server/trade/workers"
import { waitForTradePasses } from "./trade-shutdown"

/**
 * **This process is the trading engine, and Lighter's budget needs to know.**
 *
 * Lighter allows sixty requests a minute for everything, counted across the
 * website and this engine together — but each program counts its own, so
 * neither can see the other. They take different shares: the website serves
 * somebody watching a screen and gets forty, this engine reads in short
 * bursts for wallets running ladders and gets twenty. Set before anything
 * else so no read can happen first and take the wrong share.
 */
;(globalThis as { __tradeEngine?: boolean }).__tradeEngine = true

/** How often the ladders are worked once this copy is the one trading. */
const PASS_EVERY_MS = 1_000

/** How long to wait before reconnecting after the database refuses the lock connection. */
const DATABASE_RETRY_MS = 5_000

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
const passesInFlight = new Set<Promise<void>>()
let stopping = false

/**
 * Say this copy is alive, and what it is doing.
 *
 * Started before the lock is taken, on purpose: a copy waiting its turn is a
 * useful thing to be able to see, and "one leader, two standbys" on the
 * Workers screen is the difference between a spare and a mistake.
 */
async function sayAlive(role: "leader" | "standby"): Promise<void> {
  await writeHeartbeat({
    id: WORKER_ID,
    kind: "ladders",
    startedAt: STARTED_AT,
    role,
    meta: {
      host: `${hostname()} (its own program)`,
      activity: role === "leader" ? lastPass.activity : "Waiting for the lock",
      error: lastPass.error,
      priceFeed:
        role === "leader" ? priceFeedStatus() : "Not needed while waiting",
      wallets: lastPass.wallets,
      dcaMarketFirst: true,
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
    const taken = await waitToBecomeLeader().catch((error) => {
      console.error("trade worker: could not reach the database", error)
      return null
    })
    if (taken) {
      leadership = taken
      return
    }
    // A database error is different from somebody else holding the lock. The
    // blocking lock call waits its turn; only a failed connection reaches here.
    await new Promise((done) => setTimeout(done, DATABASE_RETRY_MS))
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
      const pass = advanceWorkingLadders().catch((error) => {
        // A pass that throws is one pass. The next one is a second away and
        // starts from the database, so nothing is carried over from the failure.
        console.error("trade worker: pass failed", error)
      })
      passesInFlight.add(pass)
      void pass.then(
        () => passesInFlight.delete(pass),
        () => passesInFlight.delete(pass)
      )
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
  await waitForTradePasses([...passesInFlight], lastPass.wallets)
  // Handing the lock back explicitly means the replacement container starts
  // trading in milliseconds rather than waiting for this socket to time out.
  await leadership?.release().catch(() => {})
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))

// The Restart button on the Workers screen. The pass loop sees the mark on
// the control row, clears it, and calls this — the same clean exit as a
// signal, so the lock is handed back and the supervisor starts the
// replacement within seconds.
onLadderRestartRequest((reason) => void shutdown(reason))

await main()
