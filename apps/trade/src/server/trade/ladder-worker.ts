import { eq, inArray, sql } from "drizzle-orm"

import type { TradePosition } from "@/lib/trade/paper"
import type { TradeFlowRunStatus } from "@/lib/trade/flow-run"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { tradeFlowRuns, tradeSmartLadders } from "@/server/trade/schema"
import { findWallets, walletMapKey } from "@/server/trade/wallets"

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
  /**
   * What honouring a restart request means HERE. The worker binary registers
   * its own shutdown (release the lock, exit 0); the dev server registers
   * nothing, so a Restart pressed against dev clears the mark and kills
   * nothing. On `globalThis` because the dev server holds a module cache per
   * bundle, and a module-scoped handler would quietly vanish between them.
   */
  var __tradeLadderRestart: ((reason: string) => void) | undefined
}

/**
 * Called once by `worker/src/index.ts` so a restart request can end the
 * process. The exit lives there, not here — this file also runs inside the
 * website, which must never exit itself.
 */
export function onLadderRestartRequest(
  handler: (reason: string) => void
): void {
  globalThis.__tradeLadderRestart = handler
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
  // **In production only the engine trades. Ever.** The website and the
  // shell worker are deployed as their own containers and are not rebuilt
  // when the engine is, so whichever of them stands in while the engine
  // restarts is running whatever build it last got. On 3 Sep 2026 the Trade
  // Worker was a build from before short grids existed; in the thirty
  // seconds the engine took to redeploy, that worker took the lock, read
  // every short grid as a buying grid holding a short, and ended all seven
  // of them. Nothing standing in is better than something old standing in:
  // every stop rests on the exchange, and the engine is back within seconds.
  if (process.env.NODE_ENV === "production") return
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
        // The lock lives on a database connection; if that line has died the
        // lock is already gone and another copy may hold it. Stop trading
        // first — the shell's ticker asks for the lock again within seconds.
        if (taken.lost()) {
          if (globalThis.__tradeLadderLoop) {
            clearInterval(globalThis.__tradeLadderLoop)
            globalThis.__tradeLadderLoop = undefined
          }
          globalThis.__tradeLadderLock = undefined
          globalThis.__tradeLadderHeldSince = undefined
          globalThis.__tradeLadderSince = 0
          void taken.release().catch(() => {})
          console.log(
            "Trade ladders: the lock's connection dropped, letting go"
          )
          return
        }
        void advanceWorkingLadders().catch((error) => {
          console.error("Ladder loop failed", error)
        })
      }, PASS_EVERY_MS)
      console.log(
        "Trade ladders: no worker holding the lock, so the site took it"
      )
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
type WalletKey = { userId: string; walletId: string }

async function activeSmartWalletKeys(): Promise<WalletKey[]> {
  return await db
    .selectDistinct({
      userId: tradeSmartLadders.userId,
      walletId: tradeSmartLadders.walletId,
    })
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.status, "active"))
}

type FlowPassRef = WalletKey & {
  status: TradeFlowRunStatus
  hasMarketCancels: boolean
}

async function flowPassRefs(): Promise<FlowPassRef[]> {
  return await db
    .select({
      userId: tradeFlowRuns.userId,
      walletId: tradeFlowRuns.walletId,
      status: tradeFlowRuns.status,
      hasMarketCancels: sql<boolean>`${tradeFlowRuns.marketCancels} <> '{}'::jsonb`,
    })
    .from(tradeFlowRuns)
    .where(inArray(tradeFlowRuns.status, ["running", "stopping"]))
}

function workFromWallets(
  keys: readonly WalletKey[],
  wallets: ReadonlyMap<string, TradeWallet | null>
): Array<{ userId: string; wallet: TradeWallet }> {
  const out: Array<{ userId: string; wallet: TradeWallet }> = []
  for (const row of keys) {
    const wallet = wallets.get(walletMapKey(row.userId, row.walletId)) ?? null
    // A ladder whose wallet has been deleted is not this job's problem; it
    // simply has nothing to be advanced against. Nor is an inactive one: a
    // wallet somebody switched off should stop trading, not carry on.
    if (wallet?.status === "active") out.push({ userId: row.userId, wallet })
  }
  return out
}

export async function walletsWithWork(): Promise<
  Array<{ userId: string; wallet: TradeWallet }>
> {
  const keys = await activeSmartWalletKeys()
  return workFromWallets(keys, await findWallets(keys))
}

async function enginePassInputs(): Promise<{
  work: Array<{ userId: string; wallet: TradeWallet }>
  flowRefs: FlowPassRef[]
  wallets: ReadonlyMap<string, TradeWallet | null>
}> {
  const [ladderKeys, flowRefs] = await Promise.all([
    activeSmartWalletKeys(),
    flowPassRefs(),
  ])
  const wallets = await findWallets([...ladderKeys, ...flowRefs])

  return {
    work: workFromWallets(ladderKeys, wallets),
    flowRefs,
    wallets,
  }
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

/**
 * Wallets and the flow scan already going, so a pass steps over them.
 *
 * **The slowest wallet used to set everybody's clock.** One flag said "a pass
 * is running" and every pass waited for every wallet, so a wallet that took
 * fourteen seconds meant EVERY wallet was looked at once every fourteen
 * seconds. Measured on 22 Aug 2026: a KuCoin wallet carrying 454 markets,
 * which KuCoin prices one market at a time, six at a time, so a full round is
 * about fourteen seconds and the two-second price cache has expired before the
 * round even finishes. Meanwhile a grid on Hyperliquid — whose whole price
 * read takes 0.3 seconds — was crossed and missed inside that window.
 *
 * Now a wallet holds up only itself. A quick one is looked at every second,
 * whatever a slow one on another exchange is doing.
 */
const busyWallets = new Set<string>()
const busyWalletStartedAt = new Map<
  string,
  { label: string; startedAt: number }
>()
let lastStuckWalletError: string | null = null
let flowScanning = false
let cleaningFlows = false
let checkingPriceAlerts = false
let flowScanStartedAt = 0
let lastFlowScanAt = 0

/**
 * How long a coin hunt may run before the engine says so out loud.
 *
 * One that never finishes would otherwise hold its own flag for ever and
 * quietly stop the flow looking for coins, with every wallet still trading and
 * the Workers screen still green. Silence is the part that is dangerous here,
 * not the delay.
 */
const FLOW_SCAN_STUCK_MS = 2 * 60_000
const WALLET_WORK_STUCK_MS = FLOW_SCAN_STUCK_MS

function syncBusyWalletTimers(
  work: ReadonlyArray<{ wallet: TradeWallet }>,
  now: number
): void {
  const activeIds = new Set(work.map(({ wallet }) => wallet.id))
  for (const walletId of busyWalletStartedAt.keys()) {
    if (!activeIds.has(walletId)) busyWalletStartedAt.delete(walletId)
  }
  for (const { wallet } of work) {
    if (busyWallets.has(wallet.id) && !busyWalletStartedAt.has(wallet.id)) {
      busyWalletStartedAt.set(wallet.id, {
        label: wallet.label || wallet.id,
        startedAt: now,
      })
    }
  }
}

function reportStuckWallets(now: number): boolean {
  const stuck = [...busyWalletStartedAt.values()]
    .filter(({ startedAt }) => now - startedAt >= WALLET_WORK_STUCK_MS)
    .sort((left, right) => left.startedAt - right.startedAt)

  const first = stuck[0]
  const nextError = !first
    ? null
    : stuck.length === 1
      ? `Wallet ${first.label} has been working for ${Math.round(
          (now - first.startedAt) / 60_000
        )} minutes and has not finished.`
      : `${stuck.length} wallets have not finished their turn. The first is ${first.label}, working for ${Math.round(
          (now - first.startedAt) / 60_000
        )} minutes.`

  if (nextError) lastPass.error = nextError
  else if (lastStuckWalletError && lastPass.error === lastStuckWalletError) {
    lastPass.error = null
  }
  lastStuckWalletError = nextError
  return nextError !== null
}

/** Tests share this module; state left behind decides the next test's answer. */
export function resetLadderPassState(): void {
  busyWallets.clear()
  busyWalletStartedAt.clear()
  lastStuckWalletError = null
  flowScanning = false
  cleaningFlows = false
  checkingPriceAlerts = false
  flowScanStartedAt = 0
  lastFlowScanAt = 0
}

/**
 * How often the flow looks for new coins to put a ladder on.
 *
 * **Deliberately slow, and slow for the rate limit rather than for tidiness.**
 * One scan asks the exchange about twelve coins, and a coin's base needs its 4h
 * candles: about 28 of the 1,200 request-weight Hyperliquid allows a minute,
 * each. Twelve coins is roughly 340 weight for one scan. Left to run as fast as
 * it can, that is several times the whole minute's budget spent on choosing
 * coins, and a 429 refuses everything after it — prices, orders, positions.
 * On 13–14 Aug 2026 exactly that took the app down for a day.
 *
 * It was never the urgent half of the job. A coin that gets its ladder half a
 * minute later has lost nothing; it had no ladder at all a moment ago. Watching
 * prices is the urgent half, and it now runs every second regardless of what
 * this is doing, which is the whole point of separating them.
 */
const FLOW_SCAN_EVERY_MS = 30_000

/**
 * One wallet's turn: settle a practice one, reconcile a real one.
 *
 * **A wallet that throws is written down and stepped over.** A market that
 * will not answer is a normal afternoon, not a reason for every other account
 * to stop being worked. The engine's parts are handed in rather than imported,
 * for the same reason the pass asks for them every time: this file's timer
 * outlives every reload, and a normal import would pin it to the engine as it
 * was at boot.
 */
async function workOneWallet(
  userId: string,
  wallet: TradeWallet,
  engine: {
    exposedMarketKeys: (
      userId: string,
      walletIds: readonly string[]
    ) => Promise<string[]>
    settleWallet: (
      userId: string,
      wallet: TradeWallet,
      options?: { marks: ReadonlyMap<string, number> }
    ) => Promise<
      | {
          positions: ReadonlyMap<string, TradePosition>
          marks: ReadonlyMap<string, number>
        }
      | undefined
    >
    reconcileLiveLadders: (userId: string, wallet: TradeWallet) => Promise<void>
    checkLiquidationWarnings: (input: {
      userId: string
      wallet: TradeWallet
      positions: readonly TradePosition[]
      marks: ReadonlyMap<string, number>
    }) => Promise<void>
    pushedMarks: (keys: readonly string[]) => {
      marks: ReadonlyMap<string, number>
      missing: string[]
    }
  }
): Promise<boolean> {
  try {
    if (wallet.kind === "paper") {
      // Settling IS the advance: it replays the candles since the last look
      // and pushes every ladder on the wallet along.
      //
      // Prices come off the open line when it is healthy, so a pass costs no
      // network call at all. When it is not, `pushedMarks` says which markets
      // it is short of and settling asks for them the ordinary way.
      const { marks, missing } = engine.pushedMarks(
        await engine.exposedMarketKeys(userId, [wallet.id])
      )
      const book = await engine.settleWallet(
        userId,
        wallet,
        // Only when the line covers the LOT. A settle handed half the prices
        // would read the other half as "no price", which means stand still —
        // quietly worse than asking for them.
        missing.length === 0 ? { marks } : undefined
      )
      if (book) {
        await engine
          .checkLiquidationWarnings({
            userId,
            wallet,
            positions: [...book.positions.values()],
            marks: book.marks,
          })
          .catch((error) =>
            console.error(
              `Liquidation warning failed for wallet ${wallet.id}`,
              error
            )
          )
      }
      return true
    }
    await engine.reconcileLiveLadders(userId, wallet)
    return true
  } catch (error) {
    console.error(`Ladder pass failed for wallet ${wallet.id}`, error)
    lastPass.error = error instanceof Error ? error.message : String(error)
    return false
  }
}

export async function advanceWorkingLadders(): Promise<void> {
  // A pass that overran is still doing this work. Starting a second one would
  // not make anything happen sooner; it would just double every query.
  if (working) return
  // Claimed BEFORE the first await, or two passes both get past the guard: an
  // await here hands control back to the loop, which fires again and finds the
  // flag still false. Everything that can wait belongs inside the try.
  working = true
  /** What this pass set going. Normal work is awaited after the guard is let go. */
  const started: Promise<unknown>[] = []
  try {
    if (await yieldLockIfDue()) return

    // Both switches are read every pass, so switching one takes effect within
    // a second rather than at the next restart. Off and paused differ in what
    // they mean, not in what they do here — see `workers.ts`.
    const { workerControl, clearWorkerRestart, clearFlowScanRequest } =
      await import("@/server/trade/workers")
    const control = await workerControl("ladders")
    if (control.restartRequestedAt) {
      // Between passes on purpose: the `working` guard above means a pass in
      // flight always finishes before this runs. The mark is cleared BEFORE
      // the exit, so the replacement copy boots clean instead of reading the
      // same request and restarting itself again.
      lastPass.activity = "Restarting"
      await clearWorkerRestart("ladders")
      const restart = globalThis.__tradeLadderRestart
      if (restart) restart("restart requested")
      else {
        console.log(
          "Trade ladders: restart requested — cleared; the dev server keeps running"
        )
      }
      return
    }

    // Explicit Stop cleanup must keep running even when normal ladder work is
    // paused or switched off. Stop only removes waiting orders, so blocking it
    // behind either switch would leave real orders resting after the user had
    // asked to call them off.
    const { advanceRemovedFlowLadders, advanceStoppingFlows } =
      await import("@/server/trade/flow-run")
    const pass = await enginePassInputs()
    const work = pass.work
    const checkedAt = Date.now()
    syncBusyWalletTimers(work, checkedAt)
    const hasStoppingFlows = pass.flowRefs.some(
      (run) => run.status === "stopping"
    )
    const hasRemovedMarkets = pass.flowRefs.some(
      (run) => run.status === "running" && run.hasMarketCancels
    )
    if (!cleaningFlows && (hasStoppingFlows || hasRemovedMarkets)) {
      cleaningFlows = true
      const cleanup: Promise<void>[] = []
      if (hasStoppingFlows) {
        cleanup.push(
          advanceStoppingFlows(Date.now(), db, { wallets: pass.wallets })
        )
      }
      if (hasRemovedMarkets) {
        cleanup.push(
          advanceRemovedFlowLadders(Date.now(), db, { wallets: pass.wallets })
        )
      }
      started.push(
        Promise.all(cleanup)
          .catch((error) => {
            console.error("Flow cleanup pass failed", error)
            lastPass.error =
              error instanceof Error ? error.message : String(error)
          })
          .finally(() => {
            cleaningFlows = false
          })
      )
    }
    if (!control.enabled || control.paused) {
      reportStuckWallets(checkedAt)
      lastPass.activity = control.enabled ? "Paused" : "Switched off"
      await Promise.all(started)
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
      { advanceRunningFlows },
      { checkLiquidationWarnings },
      { checkPriceAlerts },
      { checkDrawingAlerts },
    ] = await Promise.all([
      import("@/server/trade/paper"),
      import("@/server/trade/live-smart-orders"),
      import("@/server/trade/live-marks"),
      import("@/server/trade/flow-run"),
      import("@/server/trade/liquidation-warning"),
      import("@/server/trade/price-alerts"),
      import("@/server/trade/drawing-alerts"),
    ])

    // Alerts belong to accounts and markets, not wallets. Start their one
    // armed-row read alongside wallet work, so a slow notice can never hold up
    // an order, and skip a new turn while the previous alert check is alive.
    if (!checkingPriceAlerts) {
      checkingPriceAlerts = true
      started.push(
        Promise.all([
          checkPriceAlerts({ pushedMarks }).catch((error) =>
            console.error("Price alert pass failed", error)
          ),
          // The alerts drawn lines carry, checked the same way and from the
          // same prices. Its own catch, so one failing never silences the other.
          checkDrawingAlerts({ pushedMarks }).catch((error) =>
            console.error("Drawing alert pass failed", error)
          ),
        ]).finally(() => {
          checkingPriceAlerts = false
        })
      )
    }

    // Switched-on flows get their coins looked at first, so a ladder placed
    // this pass is worked by the same pass rather than waiting a second.
    //
    // Wrapped, because this decides which coins deserve a ladder and none of
    // that is worth stopping the engine over: a flow whose exchange will not
    // answer must not stop every wallet's stops and exits being worked.
    // **Set going, not waited for.** Deciding which of several hundred coins
    // deserves a ladder means asking the exchange about each one, and that took
    // about five seconds of every pass while every already-placed level waited
    // behind it to be compared against a price. Looking for new coins is the
    // patient half of this job and watching prices is the urgent half, so they
    // no longer share a clock.
    //
    // What this costs: a ladder the flow places is worked by the NEXT pass
    // rather than this one, so it starts watching its rungs a second late. A
    // rung that has bought nothing yet loses nothing by that second.
    if (flowScanning && Date.now() - flowScanStartedAt >= FLOW_SCAN_STUCK_MS) {
      lastPass.error = `The coin hunt has been running for ${Math.round(
        (Date.now() - flowScanStartedAt) / 60_000
      )} minutes and has not finished.`
    }
    if (
      !flowScanning &&
      (control.flowScanRequestedAt != null ||
        Date.now() - lastFlowScanAt >= FLOW_SCAN_EVERY_MS)
    ) {
      if (control.flowScanRequestedAt) {
        await clearFlowScanRequest(control.flowScanRequestedAt)
      }
      flowScanning = true
      flowScanStartedAt = Date.now()
      lastFlowScanAt = Date.now()
      started.push(
        advanceRunningFlows(Date.now(), db, pass.wallets)
          .catch((error) => {
            console.error("Flow pass failed", error)
            lastPass.error =
              error instanceof Error ? error.message : String(error)
          })
          .finally(() => {
            flowScanning = false
          })
      )
    }
    reportStuckWallets(Date.now())

    lastPass.wallets = work.length
    lastPass.activity =
      work.length === 0
        ? "Nothing to work"
        : `Working ${work.length} ${work.length === 1 ? "wallet" : "wallets"}`

    // **Every wallet on its own clock, not in a queue.**
    //
    // They were worked one after another, and a queue is only as quick as its
    // slowest member. On 22 Aug 2026 the slowest was a KuCoin wallet carrying
    // 454 markets: KuCoin prices one market at a time, six at a time, so a
    // full round takes about fourteen seconds and the two-second price cache
    // has expired before the round finishes. Every level on every OTHER wallet
    // waited behind that to be compared against a price, so a Hyperliquid
    // wallet whose own price read takes 0.3 seconds was still only looked at
    // every fourteen. A grid level was crossed and missed inside one such
    // window while CHIP fell 22% in ninety seconds.
    //
    // Nothing is shared between wallets, which is what makes this safe. Each
    // reads its own account, its own orders and its own prices from its own
    // exchange, and `serializeLiveWallet` already keeps one wallet's own work
    // in order. Two wallets on the SAME exchange now ask it at the same moment
    // rather than in turn, and that is the one thing to watch if a second
    // wallet is ever added on a venue that already has one.
    for (const { userId, wallet } of work) {
      // Still working from an earlier pass, so this one steps over it. Waiting
      // is what put every wallet on the slowest one's clock.
      if (busyWallets.has(wallet.id)) continue
      busyWallets.add(wallet.id)
      busyWalletStartedAt.set(wallet.id, {
        label: wallet.label || wallet.id,
        startedAt: Date.now(),
      })
      started.push(
        workOneWallet(userId, wallet, {
          exposedMarketKeys,
          settleWallet,
          reconcileLiveLadders,
          pushedMarks,
          checkLiquidationWarnings,
        })
          .finally(() => {
            busyWallets.delete(wallet.id)
            busyWalletStartedAt.delete(wallet.id)
          })
          .then((worked) => {
            // **Cleared by a wallet that worked, never by the clock.** This
            // used to be wiped at the top of every pass, which was harmless
            // while a pass took half a minute. With a pass every second, a
            // wallet failing every time showed its error for under a second
            // before the next pass wiped it, and the Workers screen called the
            // engine healthy while a wallet was dead. It has done that before,
            // for twenty minutes, on 20 Aug 2026.
            if (worked && !reportStuckWallets(Date.now())) {
              lastPass.error = null
            }
          })
      )
    }
  } finally {
    // Let go BEFORE waiting on any of it. Holding the flag until the slowest
    // wallet finished is exactly what made every other wallet wait for it. All
    // this flag protects now is the short stretch above: the lock check, the
    // two switches and the wallet list.
    working = false
  }
  // Still awaited, so a caller that wants the pass finished gets one. The
  // engine's own loop does not wait; it fires again in a second and steps over
  // whatever is still going.
  await Promise.all(started)
}

/** What a failed pass is logged under, so the line says which job it was. */
export const LADDER_WORKER_NAME = "Trade ladders"
