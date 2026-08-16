import { randomUUID } from "node:crypto"
import { and, eq, inArray } from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import { chosenWallet } from "@/lib/automations/nodes/trade-wallet"
import { tradeDcaSettingsSchema } from "@/lib/automations/nodes/trade-dca"
import { tradeMarketsSettingsSchema } from "@/lib/automations/nodes/trade-markets"
import { tradeSignalsSettingsSchema } from "@/lib/automations/nodes/trade-signals"
import type {
  FlowStopOutcome,
  TradeFlowRunSpec,
  TradeFlowStrategy,
} from "@/lib/trade/flow-run"
import {
  flowWaitCode,
  nextFlowHold,
  STRIKES_BEFORE_HOLD,
  type FlowHold,
  type FlowWaitReason,
} from "@/lib/trade/flow-waiting"
import {
  advanceSignalFlow,
  signalReadDue,
  workingSignals,
} from "@/server/trade/signal-run"
import { signalIndicatorsOn } from "@/lib/trade/indicators/registry"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db, type CustomShellDb } from "@/server/db"
import {
  assertRealOrdersAllowed,
  scrubSecrets,
} from "@/server/protocols/hyperliquid/signing"
import { awaitMarketsWalletHasMoneyOn } from "@/server/protocols/hyperliquid/user-markets"
import { placeLiveDcaLadder } from "@/server/trade/live-smart-orders"
import { cancelLadderRest, placeDcaLadder } from "@/server/trade/smart-orders"
import { tradeFlowRuns, tradeSmartLadders } from "@/server/trade/schema"
import { findWallet } from "@/server/trade/wallets"
import { assertRealMoneySwitchOn } from "@/server/trade/workers"

/**
 * Switching a flow on, off, and the pass that gives it something to do.
 *
 * **This is not a trading engine and must never become one.** Everything that
 * buys, sells, stops or exits already exists and is already proven with real
 * money: a flow's ladders are ordinary `trade_smart_ladders` rows, and
 * `ladder-worker.ts` finds them by asking which wallets have active ones. All
 * this file does is decide which coins deserve a ladder and ask the existing
 * placement path for one. If a change here starts to look like order handling,
 * it belongs in the engine instead.
 */

/**
 * How many coins one pass may start a ladder on.
 *
 * A flow may watch four hundred coins, and placing four hundred ladders in one
 * pass would mean four hundred exchange calls in a second — a rate limit, and a
 * flow that half-started. A few per pass at one pass a second fills a whole
 * list inside a minute, and every pass is safe to repeat.
 */
const STARTS_PER_PASS = 3

/**
 * How many coins one pass may even look at.
 *
 * Separate from the cap above, because that one counts ladders actually placed
 * — so a flow whose coins are all refusing (which is the normal state, most of
 * the time) went round its whole list every single pass. Four hundred coins
 * meant four hundred goes at the exchange a second, every second, to place
 * nothing. This counts every look instead, refusals included.
 *
 * Coins are taken least-recently-looked-at first, so a long list still gets all
 * the way round — four hundred coins at twelve a second is under a minute, and
 * a base takes far longer than that to form.
 */
const ATTEMPTS_PER_PASS = 12

/** Why a flow could not be switched on, thrown as a code the API turns into words. */
export type FlowStartRefusal =
  | "FLOW_NO_WALLET"
  | "FLOW_WALLET_GONE"
  | "FLOW_WALLET_INACTIVE"
  | "FLOW_WALLET_KEY"
  | "FLOW_NO_COINS"
  | "FLOW_NO_CAP"
  | "FLOW_WRONG_EXCHANGE"
  | "FLOW_ALREADY_RUNNING"
  | "FLOW_WALLET_BUSY"
  | "FLOW_UNFUNDED_MARKET"
  | "FLOW_MAINNET_OFF"
  | "FLOW_NO_INDICATORS"
  | "FLOW_STRATEGY_UNREADABLE"

/** The steps a trading flow is made of, read off its saved drawing. */
export type FlowNodes = {
  wallet: Record<string, unknown>
  markets: Record<string, unknown>
  /** Whichever strategy step it was drawn with — a flow has exactly one. */
  strategy:
    | { kind: "dca"; settings: Record<string, unknown> }
    | { kind: "signals"; settings: Record<string, unknown> }
}

/**
 * Everything checked before a single order can exist, and the frozen copy that
 * results.
 *
 * **Refused up front, never at the first buy.** A flow that looks switched on
 * while quietly refusing every order is worse than one that plainly will not
 * start: the first tells you nothing is wrong until you go looking at why you
 * own nothing. Every reason is decided here, before a row is written.
 */
export async function flowRunSpec(
  userId: string,
  nodes: FlowNodes
): Promise<{ spec: TradeFlowRunSpec; wallet: TradeWallet }> {
  const named = chosenWallet(nodes.wallet)
  if (!named) throw new Error("FLOW_NO_WALLET")
  if (named.capUsd === null || !(named.capUsd > 0)) {
    throw new Error("FLOW_NO_CAP")
  }

  const wallet = await findWallet(userId, named.id)
  if (!wallet) throw new Error("FLOW_WALLET_GONE")
  if (wallet.status !== "active") throw new Error("FLOW_WALLET_INACTIVE")
  if (wallet.kind === "live" && (!wallet.address || !wallet.hasKey)) {
    throw new Error("FLOW_WALLET_KEY")
  }

  const markets = tradeMarketsSettingsSchema.safeParse(nodes.markets)
  if (!markets.success || markets.data.marketKeys.length === 0) {
    throw new Error("FLOW_NO_COINS")
  }
  const strategy = readFlowStrategy(nodes.strategy)
  if (!strategy) throw new Error("FLOW_STRATEGY_UNREADABLE")
  // A signals flow with nothing switched on is a flow that will never buy
  // anything, and it would switch on looking perfectly healthy. Refused here
  // for the same reason as everything else in this function: at the button,
  // where somebody can do something about it, rather than at a first buy that
  // never comes.
  if (
    strategy.kind === "signals" &&
    signalIndicatorsOn(strategy.indicators) === 0
  ) {
    throw new Error("FLOW_NO_INDICATORS")
  }

  // Every coin, not a sample. One coin from the wrong exchange would be refused
  // at the moment it tried to buy, days later, with the rest of the flow
  // looking healthy.
  const wrong = markets.data.marketKeys.some((key) => {
    const ref = parseMarketKey(key)
    return (
      !ref || ref.protocol !== wallet.protocol || ref.network !== wallet.network
    )
  })
  if (wrong || markets.data.protocol !== wallet.protocol) {
    throw new Error("FLOW_WRONG_EXCHANGE")
  }

  // Hyperliquid keeps each of its markets' money separate: cash in the main
  // account does not back a trade on a market somebody else opened, and the
  // exchange refuses those buys one by one, at fire time, forever. Asked here
  // — the one moment a human is pressing a button and can fix the list — so
  // the flow never carries coins it can only ever be refused on. The exchange
  // is given a moment to answer; silence skips the check rather than treating
  // no answer as an empty wallet.
  if (wallet.kind === "live" && wallet.address) {
    const funded = await awaitMarketsWalletHasMoneyOn(
      wallet.network,
      wallet.address
    )
    if (funded !== null) {
      const allowed = new Set([...funded, ""])
      const unfunded = markets.data.marketKeys.some((key) => {
        const parts = key.split(":")
        return !allowed.has(parts.length > 3 ? parts[2] : "")
      })
      if (unfunded) throw new Error("FLOW_UNFUNDED_MARKET")
    }
  }

  // Mainnet signing is gated twice — the environment master lock and the
  // Settings toggle — and both throw at the moment of an order. Asking here
  // turns that into a refusal somebody can act on before anything is
  // switched on.
  if (wallet.kind === "live") {
    assertRealOrdersAllowed(wallet.network)
    if (wallet.network !== "testnet") await assertRealMoneySwitchOn()
  }

  return {
    wallet,
    spec: {
      protocol: wallet.protocol,
      network: wallet.network,
      marketKeys: [...markets.data.marketKeys],
      strategy,
      capUsd: named.capUsd,
      walletLabel: wallet.label,
      real: wallet.kind === "live",
    },
  }
}

/**
 * The strategy step, read into the frozen shape a run works from.
 *
 * Null when its settings cannot be read at all — a saved flow written by a
 * different build. Refusing beats switching on and trading half-read settings.
 */
function readFlowStrategy(
  step: FlowNodes["strategy"]
): TradeFlowStrategy | null {
  if (step.kind === "signals") {
    const parsed = tradeSignalsSettingsSchema.safeParse(step.settings)
    if (!parsed.success) return null
    return {
      kind: "signals",
      indicators: parsed.data.indicators,
      interval: parsed.data.interval,
      stakePct: parsed.data.stakePct,
      // Kept as a share rather than a percent, because everything that reads it
      // multiplies by a price. Converting once, here, is one less place for a
      // hundred to go missing.
      chaseGiveUp: parsed.data.chaseGiveUpPct / 100,
    }
  }
  const parsed = tradeDcaSettingsSchema.safeParse(step.settings)
  if (!parsed.success) return null
  return {
    kind: "dca",
    // Always measured from the base, whatever the flow saved — the same rule
    // a backtest forces, and for the same reason: a flow has nothing to
    // click, so "wherever price happens to be" would buy halfway up a rally
    // with no floor beneath it.
    params: { ...parsed.data.params, anchor: "base" as const },
    interval: parsed.data.interval,
  }
}

/** Switches a flow on. Writes one row and places nothing — the pass does that. */
export async function startFlowRun(
  userId: string,
  input: { automationId: string; nodes: FlowNodes; now: number },
  database: CustomShellDb = db
): Promise<{ id: string; spec: TradeFlowRunSpec }> {
  const { spec, wallet } = await flowRunSpec(userId, input.nodes)

  const running = await database
    .select({
      id: tradeFlowRuns.id,
      automationId: tradeFlowRuns.automationId,
      walletId: tradeFlowRuns.walletId,
    })
    .from(tradeFlowRuns)
    .where(
      and(eq(tradeFlowRuns.userId, userId), eq(tradeFlowRuns.status, "running"))
    )

  if (running.some((one) => one.automationId === input.automationId)) {
    throw new Error("FLOW_ALREADY_RUNNING")
  }
  // A second flow on one wallet would place a second ladder on every shared
  // coin and double the position with nothing on screen to say so.
  if (running.some((one) => one.walletId === wallet.id)) {
    throw new Error("FLOW_WALLET_BUSY")
  }

  const id = randomUUID()
  const at = new Date(input.now)
  await database.insert(tradeFlowRuns).values({
    userId,
    walletId: wallet.id,
    id,
    automationId: input.automationId,
    status: "running",
    spec,
    startedAt: at,
    updatedAt: at,
  })

  return { id, spec }
}

/**
 * Switches a flow off.
 *
 * **A stop never touches a position.** Ladders that have not bought anything
 * are called off; a coin already held keeps its position, its stop and its
 * target exactly as they are. Cancelling those "to be clean" would strip
 * somebody's protection off a live trade because they flicked a switch, and it
 * is the version that looks tidy in the moment.
 */
export async function stopFlowRun(
  userId: string,
  input: { automationId: string; now: number; reason?: string },
  database: CustomShellDb = db
): Promise<FlowStopOutcome | null> {
  const [row] = await database
    .select()
    .from(tradeFlowRuns)
    .where(
      and(
        eq(tradeFlowRuns.userId, userId),
        eq(tradeFlowRuns.automationId, input.automationId),
        eq(tradeFlowRuns.status, "running")
      )
    )
    .limit(1)
  if (!row) return null

  const wallet = await findWallet(userId, row.walletId)
  const ladders = await database
    .select({
      id: tradeSmartLadders.id,
      marketKey: tradeSmartLadders.marketKey,
      plan: tradeSmartLadders.plan,
      kind: tradeSmartLadders.kind,
    })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, row.walletId),
        eq(tradeSmartLadders.status, "active")
      )
    )

  // What this flow actually placed, not every ladder sitting on one of its
  // coins. A ladder placed by hand on a coin the flow also watches belongs to
  // whoever placed it, and cancelling it because a flow was switched off would
  // be taking away an order they never gave the flow.
  const placed = new Set(row.placed)
  const mine = ladders.filter((one) => placed.has(one.marketKey))

  let cancelled = 0
  let held = 0
  for (const ladder of mine) {
    // "Has it bought anything yet" is the whole question. A ladder that has is
    // holding a position with protection on it, and that is left alone.
    //
    // A grid on one of this flow's coins is not this flow's to cancel — it was
    // placed by hand — so it counts as held and is left exactly where it is.
    const plan = ladder.plan
    if (ladder.kind === "signal" && "phase" in plan) {
      // A signal trade IS this flow's, and one still chasing a price must be
      // called off — otherwise a flow somebody switched off carries on and
      // buys. The cancelling itself is the engine's next pass; see `stopping`.
      if (plan.phase === "buying") {
        await database
          .update(tradeSmartLadders)
          .set({
            plan: { ...plan, phase: "stopping" },
            updatedAt: new Date(input.now),
          })
          .where(
            and(
              eq(tradeSmartLadders.userId, userId),
              eq(tradeSmartLadders.id, ladder.id)
            )
          )
        cancelled += 1
      } else {
        held += 1
      }
      continue
    }
    if (!("rungs" in plan)) {
      held += 1
      continue
    }
    const bought = plan.rungs.some((rung) => rung.status === "filled")
    if (bought) {
      held += 1
      continue
    }
    if (!wallet) {
      // Nothing can be cancelled without the wallet to cancel it through, and
      // reporting that as "nothing was in the market" would be a lie about
      // money. Counted as held, which is the honest and the safer reading.
      held += 1
      continue
    }
    try {
      await cancelLadderRest(userId, wallet, { ladderId: ladder.id })
      cancelled += 1
    } catch {
      // One ladder that would not cancel — a hiccup at the exchange — must not
      // leave the flow switched on. It is reported as still held, which is the
      // honest and the safer of the two readings.
      held += 1
    }
  }

  await database
    .update(tradeFlowRuns)
    .set({
      status: "stopped",
      stoppedAt: new Date(input.now),
      stoppedReason: input.reason ?? null,
      updatedAt: new Date(input.now),
    })
    .where(and(eq(tradeFlowRuns.userId, userId), eq(tradeFlowRuns.id, row.id)))

  return { cancelled, held }
}

/**
 * One pass over every switched-on flow: give each of them a coin or two to
 * work on, and stop.
 *
 * Every pass is safe to repeat. A coin that already has a smart order on it is
 * skipped, and the placement path re-checks that under a lock — so two copies
 * of this running at once cannot both place on the same coin.
 */
export async function advanceFlowRuns(
  now: number = Date.now(),
  database: CustomShellDb = db
): Promise<void> {
  const runs = await database
    .select()
    .from(tradeFlowRuns)
    .where(eq(tradeFlowRuns.status, "running"))

  for (const run of runs) {
    const wallet = await findWallet(run.userId, run.walletId)
    // A wallet deleted or switched off stops the flow rather than leaving it
    // trying every second. The same rule the ladder worker follows.
    if (!wallet || wallet.status !== "active") {
      await stopFlowRun(
        run.userId,
        {
          automationId: run.automationId,
          now,
          reason: wallet
            ? `${run.spec.walletLabel} was switched off.`
            : `${run.spec.walletLabel} was deleted.`,
        },
        database
      )
      continue
    }

    // Paused: it looks at nothing, and nothing it already placed is touched.
    // Stopping is the act that cancels; this one only stops it looking.
    if (run.pausedAt) continue

    if (run.spec.strategy.kind === "signals") {
      await advanceSignalRun(run, wallet, now, database)
      continue
    }

    const busy = await database
      .select({ marketKey: tradeSmartLadders.marketKey })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, run.userId),
          eq(tradeSmartLadders.walletId, run.walletId),
          eq(tradeSmartLadders.status, "active"),
          inArray(tradeSmartLadders.marketKey, run.spec.marketKeys)
        )
      )
    const taken = new Set(busy.map((one) => one.marketKey))
    // Least recently looked at first, so a long list gets all the way round
    // rather than the same handful being retried while the tail is never seen.
    const free = run.spec.marketKeys
      .filter((key) => !taken.has(key))
      .sort((a, b) => (run.waiting[a]?.at ?? 0) - (run.waiting[b]?.at ?? 0))

    let started = 0
    let looked = 0
    /** Coins this pass put a ladder on, so a stop knows which are the flow's. */
    const placedNow: string[] = []

    let hold = run.hold ?? null

    // Held: the same answer three times running, so it has stopped asking.
    //
    // It comes back with ONE coin rather than the whole list. If the answer has
    // not changed, being wrong about it cost a single call instead of a
    // hundred; if it has, the next pass is back to normal.
    const holding = hold !== null && hold.until > now
    const allowed = holding
      ? 0
      : hold !== null && hold.strikes >= STRIKES_BEFORE_HOLD
        ? 1
        : ATTEMPTS_PER_PASS

    // Why each coin has nothing yet, carried forward and corrected as we go.
    const waiting: Record<string, FlowWaitReason> = { ...run.waiting }
    // A coin that has a ladder now is not waiting for anything. This clears the
    // entry left by whatever refused it before it finally went through.
    for (const key of Object.keys(waiting)) {
      if (taken.has(key)) delete waiting[key]
    }

    for (const marketKey of free) {
      if (started >= STARTS_PER_PASS || looked >= allowed) break
      looked += 1
      try {
        await placeLadderForFlow(run.userId, wallet, run.spec, marketKey)
        started += 1
        placedNow.push(marketKey)
        delete waiting[marketKey]
        // One that went through clears the count outright. Whatever was
        // refusing everything has been fixed, and carrying a wait over from
        // before the fix would leave the flow idle for no reason.
        hold = null
      } catch (error) {
        // Most refusals here are ordinary and expected — no base confirmed
        // yet, price below the base — and that IS the strategy waiting. But
        // "not enough money" and "the key was refused" arrive down the same
        // path and are not ordinary at all, and throwing them all away made
        // those two indistinguishable from working. The code is kept; the
        // canvas sorts them into waiting and needs-a-person.
        const code = flowWaitCode(error)
        // A refusal nobody has written words for goes to the server log with
        // its real message, so the next person can give it some.
        //
        // The log, and never the row: a stored message is drawn on a screen and
        // kept forever, and an unexpected error's text can carry whatever was
        // in scope when it was thrown. Scrubbed even here, because "it is only
        // a log" is how a key gets written down.
        if (code === "FLOW_UNKNOWN") {
          console.warn(
            `Flow refusal with no words: ${marketKey} — ${scrubSecrets(
              error instanceof Error ? error.message : String(error)
            )}`
          )
        }
        waiting[marketKey] = { code, at: now }
        // Only a needs-a-person answer counts towards stopping. "No base yet"
        // repeating across a hundred coins is a hundred true answers about a
        // hundred different coins, and backing off on those would be the flow
        // switching itself off for working correctly.
        hold = nextFlowHold(hold, code, now)
        if (hold && hold.until > now) break
      }
    }

    await database
      .update(tradeFlowRuns)
      .set({
        updatedAt: new Date(now),
        waiting,
        hold,
        ...(placedNow.length > 0
          ? { placed: [...new Set([...run.placed, ...placedNow])] }
          : {}),
      })
      .where(
        and(
          eq(tradeFlowRuns.userId, run.userId),
          eq(tradeFlowRuns.id, run.id)
        )
      )
  }
}

/**
 * One pass of a signals flow.
 *
 * Its own function because almost nothing about the ladder's pass applies. A
 * ladder pass is looking for coins with no ladder yet; this one also has to
 * look at coins it is already holding, because that is where a sell arrow
 * lands. And it looks at exactly ONE coin, not twelve, because looking means
 * reading candles and candles are the expensive thing — see `signal-run.ts`.
 *
 * The bookkeeping is shared, though: the same `waiting` map and the same
 * back-off, so a signals flow that cannot buy for want of cash says so on the
 * canvas in the same words a ladder flow does.
 */
async function advanceSignalRun(
  run: {
    userId: string
    id: string
    walletId: string
    spec: TradeFlowRunSpec
    waiting: Record<string, FlowWaitReason>
    acted: Record<string, number>
    placed: string[]
    hold: FlowHold | null
  },
  wallet: TradeWallet,
  now: number,
  database: CustomShellDb
): Promise<void> {
  const waiting: Record<string, FlowWaitReason> = { ...run.waiting }
  const acted = { ...run.acted }
  let hold = run.hold ?? null
  let placedNow: string | null = null

  // Held: the same problem three times running, so it has stopped asking. A
  // signals pass costs a candle read whether or not it can act on what it
  // finds, so a flow refusing every coin is worth pausing exactly as much.
  if (hold !== null && hold.until > now) return

  // Asked before the database is touched. The pass looks at one coin every two
  // and a half seconds, so three passes in four have nothing to do — and
  // reading what every coin is holding first, once a second, forever, would be
  // most of this flow's cost spent finding that out.
  if (!signalReadDue(now)) return

  const working = await workingSignals(
    run.userId,
    run.walletId,
    run.spec.marketKeys,
    database
  )

  try {
    const outcome = await advanceSignalFlow(
      {
        userId: run.userId,
        wallet,
        spec: run.spec,
        working,
        lookedAt: Object.fromEntries(
          Object.entries(run.waiting).map(([key, one]) => [key, one.at])
        ),
        acted,
        now,
      },
      database
    )
    if (outcome.marketKey) {
      if (outcome.did === "nothing") {
        // Looked at and it said nothing. That IS the strategy waiting, and the
        // entry is what makes the rotation fair — without it the same coin
        // would be "least recently looked at" forever.
        waiting[outcome.marketKey] = { code: "SIGNAL_NONE_YET", at: now }
      } else {
        delete waiting[outcome.marketKey]
        // **The arrow's own time, never the clock.** An arrow is only visible
        // once its candle has closed, so the clock at that moment is already
        // past the NEXT candle's open time — and writing it here would skip
        // that candle's arrow without a word, including a sell.
        acted[outcome.marketKey] = outcome.at
        if (outcome.did === "opened") placedNow = outcome.marketKey
      }
      // Anything that went through clears the count outright: whatever was
      // refusing has been fixed, and carrying a wait over from before the fix
      // would leave the flow idle for no reason.
      if (outcome.did !== "nothing") hold = null
    }
  } catch (error) {
    const code = flowWaitCode(error)
    if (code === "FLOW_UNKNOWN") {
      console.warn(
        `Signal refusal with no words — ${scrubSecrets(
          error instanceof Error ? error.message : String(error)
        )}`
      )
    }
    // No coin to blame it on: the pass picks its own coin and an error can come
    // from before it picked one. Recorded against the flow's back-off, which is
    // the part that matters — a key the exchange keeps refusing must stop being
    // asked whichever coin it was asked about.
    hold = nextFlowHold(hold, code, now)
  }

  // The arrow's own time, not the moment we acted on it. A pass that opened a
  // trade already wrote `signalAt` onto its plan; this is the copy that
  // outlives the plan, so the same arrow cannot start a second trade after the
  // first one closes.
  for (const [key, one] of working) {
    acted[key] = Math.max(acted[key] ?? 0, one.plan.signalAt)
  }

  await database
    .update(tradeFlowRuns)
    .set({
      updatedAt: new Date(now),
      waiting,
      acted,
      hold,
      ...(placedNow
        ? { placed: [...new Set([...run.placed, placedNow])] }
        : {}),
    })
    .where(
      and(eq(tradeFlowRuns.userId, run.userId), eq(tradeFlowRuns.id, run.id))
    )
}

/** One ladder, through the placement path a right-click already uses. */
async function placeLadderForFlow(
  userId: string,
  wallet: TradeWallet,
  spec: TradeFlowRunSpec,
  marketKey: string
): Promise<void> {
  // Only ever called for a ladder flow — the pass forks on the strategy long
  // before here — so anything else is a bug worth stopping on rather than a
  // case to handle.
  if (spec.strategy.kind !== "dca") throw new Error("FLOW_NO_COINS")
  const input = {
    marketKey,
    // Never read: the ladder hangs off the base, which is forced in the spec.
    clickPx: 0,
    interval: spec.strategy.interval,
    params: spec.strategy.params,
    potUsd: spec.capUsd,
  }
  if (wallet.kind === "live") {
    await placeLiveDcaLadder(userId, wallet, input)
    return
  }
  await placeDcaLadder(userId, wallet, input)
}

/**
 * Stops a flow looking for new coins, or sets it looking again.
 *
 * **It touches nothing that is already in the market.** Every ladder it placed
 * keeps working, every position keeps its stop and its target. That is the
 * whole difference from stopping, and it is the difference between "hold on a
 * moment" and "I have changed my mind": a pause somebody meant as the first,
 * that cancelled orders like the second, would be the worst kind of surprise.
 */
export async function pauseFlowRun(
  userId: string,
  input: { automationId: string; paused: boolean; now: number },
  database: CustomShellDb = db
): Promise<boolean> {
  const [row] = await database
    .select({ id: tradeFlowRuns.id })
    .from(tradeFlowRuns)
    .where(
      and(
        eq(tradeFlowRuns.userId, userId),
        eq(tradeFlowRuns.automationId, input.automationId),
        eq(tradeFlowRuns.status, "running")
      )
    )
    .limit(1)
  if (!row) return false

  await database
    .update(tradeFlowRuns)
    .set({
      pausedAt: input.paused ? new Date(input.now) : null,
      // Setting off again clears any wait it was serving. Somebody who pauses
      // and unpauses is telling you to look now, and making them wait out a
      // back-off they cannot see would read as the button doing nothing.
      ...(input.paused ? {} : { hold: null }),
      updatedAt: new Date(input.now),
    })
    .where(and(eq(tradeFlowRuns.userId, userId), eq(tradeFlowRuns.id, row.id)))
  return true
}

/**
 * Makes a flow that has stopped asking try again right now.
 *
 * **Because only a person knows when something has been fixed.** The wait
 * doubles on the assumption that nothing has changed, which is right until
 * money lands in the account or a setting is corrected — and then it is just
 * the app being stubborn for up to a quarter of an hour. This is the button
 * that says "I have dealt with it".
 */
export async function retryFlowRunNow(
  userId: string,
  input: { automationId: string; now: number },
  database: CustomShellDb = db
): Promise<boolean> {
  const [row] = await database
    .select({ id: tradeFlowRuns.id })
    .from(tradeFlowRuns)
    .where(
      and(
        eq(tradeFlowRuns.userId, userId),
        eq(tradeFlowRuns.automationId, input.automationId),
        eq(tradeFlowRuns.status, "running")
      )
    )
    .limit(1)
  if (!row) return false

  await database
    .update(tradeFlowRuns)
    .set({ hold: null, updatedAt: new Date(input.now) })
    .where(and(eq(tradeFlowRuns.userId, userId), eq(tradeFlowRuns.id, row.id)))
  return true
}
