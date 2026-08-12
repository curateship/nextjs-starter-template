import { eq } from "drizzle-orm"

import type { TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { tradeSmartLadders } from "@/server/trade/schema"
import { findWallet } from "@/server/trade/wallets"

/**
 * The trading engine's own loop: every working ladder, looked at every second,
 * by the server.
 *
 * **Why it exists.** Ladders used to be driven entirely by the trade screen.
 * The page polled every four seconds and each poll settled the wallet and
 * pushed the live ladders along. Close the tab and nothing happened — no rung
 * bought, no stop fired, no exit reached the exchange. Forty coins running
 * meant forty reasons never to close the tab, and nothing said so.
 *
 * **Where it runs.** Properly, in `worker/` — its own program, started
 * separately, so a deploy or a crash of the website cannot touch money that is
 * in a trade. The website can also run it, but only when no worker has claimed
 * the job; see `WEB_STANDS_BACK_MS`.
 *
 * **Why it is not on the shell's ticker.** That loop is shared by every job in
 * every app and turns once every fifteen seconds. Trading is the one thing here
 * where fifteen seconds is a price: in a fall, a rung's level can come and go
 * inside one of them.
 *
 * The screen's own poll is still there and still useful, and running both is
 * harmless. Every pass is safe to repeat: a bar only applies to an order that
 * already existed when the bar opened, and a level checked against today's
 * price either fires now or was never reached.
 */

/**
 * How often the ladders are worked.
 *
 * A second, not four, because the prices arrive on an open line rather than
 * being asked for — a pass costs a database read and no network call at all,
 * so the only reason to wait longer is politeness to the database.
 */
const PASS_EVERY_MS = 1_000

declare global {
  var __tradeLadderLoop: NodeJS.Timeout | undefined
  /** A lock check already in flight, so ticks cannot stack them up. */
  var __tradeLadderClaiming: boolean | undefined
  /** When this process first offered to trade — see `WEB_STANDS_BACK_MS`. */
  var __tradeLadderSince: number | undefined
  /** The lock this process holds, kept so it can be handed back. */
  var __tradeLadderLock: { release: () => Promise<void> } | undefined
  /** When it must be offered back around — see `WEB_YIELDS_EVERY_MS`. */
  var __tradeLadderHeldSince: number | undefined
}

/** True while a pass is still going, so two can never overlap. */
let working = false

/**
 * How long the website waits before offering to do the trading itself.
 *
 * The worker is meant to do it, and only one copy of anything may trade — so
 * both take the same lock. The worker takes it the moment it starts; the
 * website waits a minute first. That one rule settles it without a setting to
 * get wrong: if a worker is running anywhere, it always wins, and if none is,
 * the website picks the work up a minute later rather than nothing happening
 * at all.
 */
const WEB_STANDS_BACK_MS = 60_000

/**
 * How often the website hands the lock back and asks for it again.
 *
 * Without this, a site that took the lock keeps it for as long as the process
 * lives — so starting the worker afterwards leaves it waiting forever, and the
 * only way to hand over is to restart the website. Letting go for an instant
 * every few minutes means a worker started at any time takes over on its own,
 * and if none is there the site simply picks it straight back up.
 */
const WEB_YIELDS_EVERY_MS = 5 * 60_000

/**
 * Start the loop if it is not already going, and only if this process is the
 * one that holds the trading lock. Safe to call on every tick of the shell's
 * ticker, which is exactly how it is called.
 *
 * The handle lives on `globalThis` rather than in this module: the dev server
 * reloads modules in place, and a module-scoped one would reset on reload and
 * leave a second timer running behind the first.
 */
export function ensureLadderLoop(): void {
  // Tests drive each pass themselves; a timer would outlive the test run.
  if (process.env.VITEST || process.env.NODE_ENV === "test") return
  if (globalThis.__tradeLadderLoop || globalThis.__tradeLadderClaiming) return
  globalThis.__tradeLadderClaiming = true

  const startedAt = (globalThis.__tradeLadderSince ??= Date.now())
  if (Date.now() - startedAt < WEB_STANDS_BACK_MS) {
    globalThis.__tradeLadderClaiming = false
    return
  }

  void (async () => {
    try {
      const { tryBecomeLeader } = await import("@/server/trade/leadership")
      const taken = await tryBecomeLeader()
      if (!taken.held) return
      globalThis.__tradeLadderLock = taken
      globalThis.__tradeLadderHeldSince = Date.now()
      globalThis.__tradeLadderLoop = setInterval(() => {
        void advanceWorkingLadders().catch((error) => {
          console.error("Ladder loop failed", error)
        })
      }, PASS_EVERY_MS)
      console.log("Trade ladders: no worker holding the lock, so the site took it")
    } catch (error) {
      console.error("Ladder lock check failed", error)
    } finally {
      globalThis.__tradeLadderClaiming = false
    }
  })()
}

/**
 * Hand the lock back if this process has held it long enough, so a worker
 * started later can take over without anybody restarting the website.
 *
 * The loop stops with the lock. `ensureLadderLoop` runs on the shell's ticker
 * every fifteen seconds, so the site asks for it again almost at once — and
 * loses, quietly, if a worker got there first.
 */
async function yieldLockIfDue(): Promise<boolean> {
  const held = globalThis.__tradeLadderHeldSince
  if (!globalThis.__tradeLadderLock || !held) return false
  if (Date.now() - held < WEB_YIELDS_EVERY_MS) return false

  const lock = globalThis.__tradeLadderLock
  globalThis.__tradeLadderLock = undefined
  globalThis.__tradeLadderHeldSince = undefined
  if (globalThis.__tradeLadderLoop) {
    clearInterval(globalThis.__tradeLadderLoop)
    globalThis.__tradeLadderLoop = undefined
  }
  // Asked for again from scratch, so the stand-back delay does not apply and
  // the gap is milliseconds rather than a minute.
  globalThis.__tradeLadderSince = 0
  await lock.release().catch(() => {})
  return true
}

/**
 * The wallets with at least one working smart order, and who owns them —
 * ladders and grids alike, since both live in the one table and both are
 * advanced by the same settle.
 *
 * One row per wallet however many it holds: settling a wallet advances all of
 * them together, so asking per order would do the same work several times over.
 * Nothing here reads the plan, which is what lets a new kind of smart order be
 * picked up without this job changing at all.
 */
export async function walletsWithWork(): Promise<
  Array<{ userId: string; wallet: TradeWallet }>
> {
  const rows = await db
    .selectDistinct({
      userId: tradeSmartLadders.userId,
      walletId: tradeSmartLadders.walletId,
    })
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.status, "active"))

  const out: Array<{ userId: string; wallet: TradeWallet }> = []
  for (const row of rows) {
    const wallet = await findWallet(row.userId, row.walletId)
    // A ladder whose wallet has been deleted is not this job's problem; it
    // simply has nothing to be advanced against. Nor is an inactive one: a
    // wallet somebody switched off should stop trading, not carry on.
    if (wallet && wallet.status === "active") out.push({ userId: row.userId, wallet })
  }
  return out
}

/**
 * What the last pass did, for the Workers screen to report.
 *
 * Held in memory rather than written down on every pass: the heartbeat carries
 * it a moment later anyway, and a row rewritten every second to say "still
 * fine" is a lot of writing for very little.
 */
export const lastPass = {
  activity: "Not started",
  error: null as string | null,
  wallets: 0,
}

export async function advanceWorkingLadders(): Promise<void> {
  // A pass that overran is still doing this work. Starting a second one would
  // not make anything happen sooner; it would just double every query.
  if (working) return
  // Claimed BEFORE the first await, or two passes both get past the guard: an
  // await here hands control back to the loop, which fires again and finds the
  // flag still false. Everything that can wait belongs inside the try.
  working = true
  try {
    if (await yieldLockIfDue()) return

    // Both switches are read every pass, so switching one takes effect within
    // a second rather than at the next restart. Off and paused differ in what
    // they mean, not in what they do here — see `workers.ts`.
    const { workerControl } = await import("@/server/trade/workers")
    const control = await workerControl("ladders")
    if (!control.enabled || control.paused) {
      lastPass.activity = control.enabled ? "Paused" : "Switched off"
      return
    }
    // Asked for on every pass rather than imported at the top of this file.
    // The timer above is created once and outlives every reload, so a normal
    // import would hand it the engine as it was at boot and go on calling that
    // forever — editing the engine would appear to do nothing.
    const [
      { settleWallet, exposedMarketKeys },
      { reconcileLiveLadders },
      { pushedMarks },
    ] =
      await Promise.all([
        import("@/server/trade/paper"),
        import("@/server/trade/live-smart-orders"),
        import("@/server/trade/live-marks"),
      ])

    const work = await walletsWithWork()
    lastPass.wallets = work.length
    lastPass.activity =
      work.length === 0
        ? "Nothing to work"
        : `Working ${work.length} ${work.length === 1 ? "wallet" : "wallets"}`
    lastPass.error = null

    for (const { userId, wallet } of work) {
      // One wallet's failure must not take the rest of the pass with it — a
      // market that will not answer is a normal afternoon, not a reason for
      // every other account to stop being worked.
      try {
        if (wallet.kind === "paper") {
          // Settling IS the advance: it replays the candles since the last look
          // and pushes every ladder on the wallet along.
          //
          // Prices come off the open line when it is healthy, so a pass costs
          // no network call at all. When it is not, `pushedMarks` says so and
          // settling asks for them the ordinary way.
          const marks = pushedMarks(await exposedMarketKeys(userId, [wallet.id]))
          await settleWallet(userId, wallet, marks ? { marks } : undefined)
        } else {
          await reconcileLiveLadders(userId, wallet)
        }
      } catch (error) {
        console.error(`Ladder pass failed for wallet ${wallet.id}`, error)
        lastPass.error = error instanceof Error ? error.message : String(error)
      }
    }
  } finally {
    working = false
  }
}

/** What a failed pass is logged under, so the line says which job it was. */
export const LADDER_WORKER_NAME = "Trade ladders"
