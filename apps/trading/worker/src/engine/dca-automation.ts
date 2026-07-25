import type { CandleWsEvent } from "@nktkas/hyperliquid"

import {
  dcaHistoryBars,
  type AutomationConfig,
  type AutomationDcaConfig,
} from "@/lib/automations/automation"
import {
  dcaAllocationPcts,
  dcaLevels,
} from "@/lib/automations/dca"
import { evaluateAutomation } from "@/lib/automations/evaluate"
import {
  advanceQflBaseTracker,
  createQflBaseTracker,
  qflBaseRespectScore,
  type QflBaseTracker,
} from "@/lib/automations/qfl"
import type { IndicatorCandle } from "@/lib/indicators/contract"
import { nextTrailState, type TrailState } from "@/lib/strategies/trailing-stop"

import type { DesiredOrder, Strategy, StrategyCtx } from "../strategies/contract"
import { exitLevels, tickExit } from "./trade-manager"

const EXIT_RETRY_MS = 1_000
const EPSILON = 1e-9
// Flash-crash fail-safe: a candle that closes more than this many rung-spacings
// past the shallowest unbought rung is "violent" (a real crash, not an orderly
// dip). Rather than pretend we filled cleanly at the rung levels, we wait for
// the first green candle and buy the blown-through rungs at that bounce.
const VIOLENT_SPACING_MULTIPLE = 2
const INTERVAL_MS = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
} as const

type DcaRungState = {
  index: number
  /** This rung's step below the one above it, in percent (from the config). */
  deviation: number
  /** The rung's trigger level. Starts base-anchored; in market mode it re-steps
   * down from each actual fill, so deeper rungs chase real further dips rather
   * than stale pre-crash levels. */
  plannedPx: number
  /** Share of the cycle's frozen equity budgeted to this rung, in percent. */
  allocationPct: number
  filledSz: number
  /** Units of this rung already sold back (previous-rung take-profit). */
  soldSz: number
  /** A market buy for this rung has been submitted (awaiting its fill). */
  entrySubmitted: boolean
  /** The rung's buy has filled — it never buys again this cycle. */
  entryComplete: boolean
}

type DcaCycle = {
  base: number
  startedAt: number
  frozenEquity: number
  rungs: DcaRungState[]
  hadFill: boolean
  /** Price of the cycle's FIRST buy. With the stop anchored to "first", the
   * stop measures from here instead of the average the ladder keeps dragging
   * down — so the configured percent is the real worst case. */
  firstEntryPx: number | null
  /** Fail-safe: a violent candle deferred entries until the first green bar. */
  waitingForGreen: boolean
  /** Limit mode only: the deepest rung allowed a resting limit so far. Only this
   * one rung's limit is on the book at a time, and it advances one step per bar
   * (gated by the fail-safe) — so a crash fills at most the one resting rung
   * instead of cascading through the whole ladder. */
  armedIndex: number
  /** "Require two green" step-down mode only: price has already fallen at least
   * the armed rung's step below the reference (base for the first rung, the last
   * fill after), so the ladder is now waiting for two green candles to buy the
   * bounce. Cleared each time a rung fills, so the NEXT rung needs its own fresh
   * drop — never more than one rung from a single fall. */
  stepArmed: boolean
  lastExitAttemptAt: number | null
}

export type DcaAutomationState = {
  lastEvaluatedCandleTime: number | null
  baseTracker: QflBaseTracker | null
  /** A confirmed base waiting for the ladder to be built under it. */
  candidateBase: number | null
  candidateTime: number | null
  active: DcaCycle | null
  /** One-shot: onCandleClose sets this so desiredOrders market-buys the
   * confirmed rungs at THIS bar's close, then clears it — so intrabar
   * re-evaluations on later bars never buy behind the fail-safe's back. */
  buyNow: boolean
  /** A rung buy filled on the CURRENT bar (reset each candle). In limit mode a
   * rung's profitable exit is held same-bar only when the bar ALSO closed down —
   * then the dip-to-buy couldn't have been followed by a run-up to the sell. On
   * an up bar the recovery is plausible, so the same-bar win is allowed. */
  boughtThisBar: boolean
  /** Latched each candle close: were the last two closed candles both green?
   * With "require two green" on, desiredOrders reads THIS latched value rather
   * than the in-progress bar, so a red dip can still fill the rung that two prior
   * green candles unlocked instead of cancelling it. */
  greenUnlocked: boolean
  /** TP/SL close requested by the trade-manager or a close signal. */
  exitRequested: boolean
  trail: TrailState | null
}

const initialState = (): DcaAutomationState => ({
  lastEvaluatedCandleTime: null,
  baseTracker: null,
  candidateBase: null,
  candidateTime: null,
  active: null,
  buyNow: false,
  boughtThisBar: false,
  greenUnlocked: false,
  exitRequested: false,
  trail: null,
})

/**
 * Past base quality: with the filter on, only a crack in a market whose recent
 * cracks mostly recovered qualifies. Same scoring the QFL entry uses.
 */
function respectQualifies(
  candles: IndicatorCandle[],
  dca: AutomationDcaConfig,
  now: number
): boolean {
  if (!dca.respectFilterEnabled) return true
  const score = qflBaseRespectScore(candles, dca, now)
  return (
    score.hasFullHistory &&
    score.rate !== null &&
    score.rate >= dca.minRespectPct
  )
}

function numericCandles(candles: CandleWsEvent[]): IndicatorCandle[] {
  return candles.map((candle) => ({
    t: candle.t,
    o: Number(candle.o),
    h: Number(candle.h),
    l: Number(candle.l),
    c: Number(candle.c),
    v: Number(candle.v),
  }))
}

function updateBaseTracker(
  current: QflBaseTracker | null,
  candles: IndicatorCandle[],
  dca: AutomationDcaConfig,
  intervalMs: number
): QflBaseTracker {
  const settingsChanged =
    current !== null &&
    (current.basePeriods !== dca.basePeriods ||
      current.pumpPeriods !== dca.pumpPeriods)
  let tracker =
    current && !settingsChanged
      ? current
      : createQflBaseTracker(dca.basePeriods, dca.pumpPeriods)
  let pending = candles.filter(
    (candle) =>
      tracker.processedTime === null || candle.t > tracker.processedTime
  )
  // A gap in the feed means the tracker's rolling window is stale — rebuild it.
  if (
    tracker.processedTime !== null &&
    pending[0] &&
    pending[0].t - tracker.processedTime > intervalMs * 1.5
  ) {
    tracker = createQflBaseTracker(dca.basePeriods, dca.pumpPeriods)
    pending = candles
  }
  for (const candle of pending) tracker = advanceQflBaseTracker(tracker, candle)
  return tracker
}

function buildCycle(
  dca: AutomationDcaConfig,
  base: number,
  candleTime: number,
  equity: number
): DcaCycle {
  const levels = dcaLevels(base, dca.rungs)
  const allocations = dcaAllocationPcts(
    dca.rungs.length,
    dca.maxPositionPct,
    dca.sizeMultiplier
  )
  return {
    base,
    startedAt: candleTime,
    frozenEquity: equity,
    // Rungs no longer rest as limit orders. Each carries a dollar budget
    // (allocationPct of the frozen equity); it's market-bought when a candle
    // confirms its level, and sized in units at that actual fill price so the
    // budget deploys the same dollars whether it fills at the level or, after
    // the fail-safe, at a lower bounce.
    rungs: levels.map((plannedPx, index) => ({
      index,
      deviation: dca.rungs[index]?.deviation ?? 0,
      plannedPx,
      allocationPct: allocations[index],
      filledSz: 0,
      soldSz: 0,
      entrySubmitted: false,
      entryComplete: false,
    })),
    hadFill: false,
    firstEntryPx: null,
    waitingForGreen: false,
    armedIndex: 0,
    stepArmed: false,
    lastExitAttemptAt: null,
  }
}

function purposeIndex(purpose: string, prefix: string): number | null {
  if (!purpose.startsWith(prefix)) return null
  const index = Number(purpose.slice(prefix.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function updateRung(
  cycle: DcaCycle,
  index: number,
  update: (rung: DcaRungState) => DcaRungState
): DcaCycle {
  return {
    ...cycle,
    rungs: cycle.rungs.map((rung) =>
      rung.index === index ? update(rung) : rung
    ),
  }
}

function marketExit(sz: number): DesiredOrder {
  return {
    purpose: "dca:exit",
    side: "sell",
    orderType: "market",
    sz: String(sz),
    tif: "Ioc",
    reduceOnly: true,
  }
}

/**
 * DCA ladder strategy: on a base crack it rests a ladder of buys anchored a set
 * percent below the base, sized to split a max-position cap by rung weight. The
 * buys route through the broker as ordinary orders, so the broker blends the
 * average entry; the Take Profit / Stop Loss nodes (in config.protection.long)
 * then measure from that average through the shared trade-manager — the same
 * exit math the signal engine and the chart use. Long-only in v1.
 */
export function createDcaAutomationStrategy(
  config: AutomationConfig
): Strategy<never, DcaAutomationState> {
  const dca = config.dca
  if (!dca) throw new Error("DCA configuration is required.")
  const window = dcaHistoryBars(dca, config.interval)
  const protection = config.protection.long ?? {}
  // Rung take-profit modes, both DCA-only. "previousRungSellAll" peels the
  // ladder: as price recovers, each averaged-in buy is rested for sale at the
  // price of the buy above it (the first at the base). "nearestRungSellAll"
  // instead rests ONE order for the whole position at the nearest rung above the
  // deepest buy, so a bounce back to that single level closes everything at once.
  // Either way the average take-profit is replaced by these sells, so only the
  // stop loss still force-closes the position.
  const peelRungs = protection.takeProfitMode === "previousRungSellAll"
  const nearestRung = protection.takeProfitMode === "nearestRungSellAll"
  const rungTakeProfit = peelRungs || nearestRung
  const closeProtection = rungTakeProfit
    ? { ...protection, takeProfitPct: undefined }
    : protection
  const closeRules = config.rules.filter((rule) => rule.action === "close")
  const closeConfig: AutomationConfig | null =
    closeRules.length > 0
      ? {
          v: 2,
          kind: "automation",
          interval: config.interval,
          rules: closeRules,
          protection: config.protection,
        }
      : null

  const positionOf = (ctx: StrategyCtx<DcaAutomationState>) => ({
    szi: Number(ctx.position?.szi ?? 0),
    entryPx: Number(ctx.position?.entryPx ?? 0),
  })

  // Did the bar currently being processed close below its open (fell)? Used to
  // decide whether a same-bar buy→sell round trip is plausible: on an up bar the
  // dip came first then the recovery (allow it); on a down bar the recovery
  // couldn't have followed (defer the sell). The current bar is the last one in
  // the window (backtest data is complete, so its close is known).
  // What the trade manager measures exits against. With the stop anchored to
  // "first", it uses the cycle's first buy so the configured percent is the real
  // worst case, instead of the average the ladder keeps dragging down.
  const exitStateFor = (state: DcaAutomationState) => ({
    exitRequested: state.exitRequested,
    trail: state.trail,
    stopAnchorPx:
      closeProtection.stopAnchor === "first"
        ? (state.active?.firstEntryPx ?? null)
        : null,
  })

  const barClosedDown = (ctx: StrategyCtx<DcaAutomationState>): boolean => {
    const cur = ctx.candles(config.interval, 1).at(-1)
    return cur ? Number(cur.c) < Number(cur.o) : false
  }

  // "Require two green": a rung only buys once the two most recently CLOSED
  // candles were both green (close above open) — a confirmed uptick. Evaluated at
  // candle close and latched into state (see greenUnlocked), so the later red dip
  // that actually fills the rung can't retroactively cancel the buy the prior two
  // green candles unlocked.
  const lastTwoGreen = (ctx: StrategyCtx<DcaAutomationState>): boolean => {
    const recent = ctx.candles(config.interval, 2)
    if (recent.length < 2) return false
    const prev = recent[recent.length - 2]
    const cur = recent[recent.length - 1]
    return Number(prev.c) > Number(prev.o) && Number(cur.c) > Number(cur.o)
  }

  const releaseCycle = (ctx: StrategyCtx<DcaAutomationState>) => {
    // Hand this market's room back to the shared wallet (no-op when running a
    // single market or a live bot, which have no shared portfolio).
    ctx.qflPortfolio?.release?.(ctx.market)
    ctx.setState({
      ...ctx.state,
      active: null,
      candidateBase: null,
      candidateTime: null,
      exitRequested: false,
      trail: null,
    })
  }

  return {
    type: "automation",
    warmup: () => ({ candleIntervals: [config.interval] }),
    init: initialState,
    onStart: (ctx) => {
      const positionSz = positionOf(ctx).szi
      if (positionSz !== 0 && !ctx.state.active) {
        throw new Error(
          "DCA bots cannot take ownership of an unexplained existing position."
        )
      }
      if (ctx.state.active && positionSz === 0 && ctx.state.active.hadFill) {
        releaseCycle(ctx)
      }
    },
    onCandleClose: (ctx, _params, ws) => {
      const intervalMs = INTERVAL_MS[config.interval]
      const prevTracker = ctx.state.baseTracker
      const settingsChanged =
        prevTracker !== null &&
        (prevTracker.basePeriods !== dca.basePeriods ||
          prevTracker.pumpPeriods !== dca.pumpPeriods)
      // HOT PATH: the base tracker keeps its own rolling window, so it only needs
      // the NEW bar — re-converting the whole ~100-bar window every candle was the
      // dominant cost at fine timeframes. Fall back to the full window only when
      // something genuinely needs it: the first bar (warmup), a settings change,
      // close rules, a gap in the feed, or the (rarely-on) respect filter — and
      // the respect filter only feeds the arm check, which can only fire while
      // idle (no active cycle), so we force the window for it ONLY then, not on
      // every held-position bar.
      const needsWindow =
        prevTracker === null ||
        settingsChanged ||
        (dca.respectFilterEnabled && ctx.state.active === null) ||
        closeConfig !== null
      let candles: IndicatorCandle[]
      if (needsWindow) {
        candles = numericCandles(
          ctx.candles(config.interval, window).filter((c) => c.T <= ctx.now)
        )
      } else {
        const cur = numericCandles([ws as CandleWsEvent])[0]
        const gap =
          cur !== undefined &&
          prevTracker.processedTime !== null &&
          cur.t - prevTracker.processedTime > intervalMs * 1.5
        candles = gap
          ? numericCandles(
              ctx.candles(config.interval, window).filter((c) => c.T <= ctx.now)
            )
          : cur
            ? [cur]
            : []
      }
      const last = candles.at(-1)
      if (!last || ctx.state.lastEvaluatedCandleTime === last.t) return
      if (needsWindow && candles.length < 3) return

      const baseTracker = updateBaseTracker(
        prevTracker,
        candles,
        dca,
        intervalMs
      )
      let state: DcaAutomationState = {
        ...ctx.state,
        lastEvaluatedCandleTime: last.t,
        baseTracker,
        // Latch the two-green check at THIS close; desiredOrders reads it next bar
        // so a red dip can still fill what two green candles unlocked.
        greenUnlocked: lastTwoGreen(ctx),
        // A new bar has closed: the previous bar's buys are settled, so a rung's
        // exit may fill from here on. (Set again if a buy fills intrabar below.)
        boughtThisBar: false,
      }
      const currentBase = baseTracker.currentBase
      // Rest the ladder as soon as a base is confirmed (before any crack), so its
      // rungs sit BELOW the base waiting. A fast crash then fills each rung at its
      // own level as price sweeps through, instead of the ladder being placed
      // only at the crack candle's close — after price already blew past every
      // rung — and market-buying the whole stack at the bottom.
      //
      // Only arm while price is still AT OR ABOVE the base. The whole ladder sits
      // below the base, so this guarantees every rung rests below the current
      // price and fills on the way down. If price is already under the base — a
      // crash in progress, or the instant after a stop-out on this same base —
      // resting a ladder would mean market-buying every rung at once at the
      // bottom; instead we wait for a fresh, lower base to form.
      // The cheap arm precondition. The pricey respect-quality scan is deferred
      // to the arm block itself (below), so it runs ONLY on the rare idle bar
      // where a fresh ladder can actually arm — never on every bar of a live
      // cycle. Computing it here every bar made the respect filter O(bars ×
      // window); this restores the short-circuit the old crack gate gave it.
      const baseArmable = currentBase !== null && last.c >= currentBase

      const closeSignal =
        closeConfig !== null &&
        evaluateAutomation(candles, closeConfig).actions.some(
          (action) => action.time === last.t && action.action === "close"
        )
      if (closeSignal && state.active) {
        ctx.setState({ ...state, exitRequested: true })
        return
      }

      const positionSz = positionOf(ctx).szi

      // Re-anchor an unfilled ladder onto whatever base is fresh now, while price
      // is still at or above it. Market/limit mode follows the base EITHER way —
      // up to a higher shelf or down to a lower low. (Following only downward was
      // the "first buy 17% below the shelf" bug: the ladder armed on an old low
      // base and never rose with price to the new shelf.)
      //
      // Step-down ("require two green") mode re-anchors UPWARD ONLY: it moves to a
      // higher base when price climbs to a new shelf — otherwise a ladder armed on
      // an old low base whose price ran away up would never dip to its trigger and
      // the coin would wedge, armed forever. It must NOT follow the base DOWN: a
      // lower base would slide the trigger below the falling price so the confirmed
      // (dip + two green) entry could never arm — that starves it to zero buys.
      //
      // Once the first buy fills we're committed and the deeper rungs stay counted
      // off that base; we also don't re-anchor mid-fail-safe (buy the bounce, not a
      // fresh low base the same crash just printed) or once the step has armed.
      if (
        state.active &&
        !state.active.hadFill &&
        !state.active.waitingForGreen &&
        !state.active.stepArmed &&
        currentBase !== null &&
        last.c >= currentBase &&
        (dca.requireTwoGreen
          ? currentBase > state.active.base
          : currentBase !== state.active.base)
      ) {
        state = {
          ...state,
          active: null,
          candidateBase: currentBase,
          candidateTime: last.t,
        }
      }

      // Arm: a confirmed base with price at/above it earmarks a fresh ladder. The
      // respect scan runs LAST, only once the cheap idle preconditions all hold.
      if (
        !state.active &&
        state.candidateBase === null &&
        positionSz === 0 &&
        baseArmable &&
        respectQualifies(candles, dca, last.t)
      ) {
        state = {
          ...state,
          candidateBase: currentBase,
          candidateTime: last.t,
        }
        ctx.emit("dca_candidate", "DCA armed its ladder under the base.", {
          base: currentBase,
        })
      }

      // Build the ladder from the candidate base. Nothing rests on the book —
      // each rung is a dollar budget that gets market-bought when a candle
      // confirms its level (below).
      if (!state.active && state.candidateBase !== null && positionSz === 0) {
        const equity = Number(ctx.equity)
        if (equity > 0) {
          // Compound (default) sizes each cycle off the live balance; "fixed"
          // sizes off the starting balance so every cycle bets the same dollars.
          const startingEquity = Number(ctx.startingEquity)
          const sizingEquity =
            dca.compound || !(startingEquity > 0) ? equity : startingEquity
          // Shared wallet: only start if there's room for the FIRST rung. We
          // reserve only what actually fills, so a coin holding one small rung
          // never blocks the wallet for everyone; a full wallet skips the entry
          // (a real account can't open what it can't fund). Solo/live runs have
          // no portfolio and always enter.
          const firstRungPct = dcaAllocationPcts(
            dca.rungs.length,
            dca.maxPositionPct,
            dca.sizeMultiplier
          )[0]
          if (
            ctx.qflPortfolio?.remaining &&
            ctx.qflPortfolio.remaining(ctx.market) + 1e-9 < firstRungPct
          ) {
            ctx.emit(
              "dca_exposure_skipped",
              "DCA skipped this base — the shared wallet was already full."
            )
            state = { ...state, candidateBase: null, candidateTime: null }
          } else {
            state = {
              ...state,
              active: buildCycle(
                dca,
                state.candidateBase,
                state.candidateTime ?? ctx.now,
                sizingEquity
              ),
              candidateBase: null,
              candidateTime: null,
            }
            ctx.emit("dca_cycle_started", "DCA armed its buy ladder.")
          }
        }
      }

      // Decide THIS bar's entries. Rung confirmation: a rung is confirmed once a
      // candle CLOSES at or below its level; desiredOrders then market-buys it
      // near the close. Flash-crash fail-safe: if the close sits more than
      // VIOLENT_SPACING_MULTIPLE rung-spacings below the shallowest unbought
      // rung (a real crash, not an orderly dip), we don't chase the knife — we
      // wait for the first green candle and buy the blown-through rungs at that
      // bounce.
      let buyNow = false
      const active = state.active
      // STEP-DOWN CONFIRMED entry ("require two green"): the ladder never rests
      // limits and never fires on a raw level-cross. The next rung ARMS once price
      // has fallen at least its step below the reference (base for the first rung,
      // the last fill after); desiredOrders then market-buys ONE rung at the bounce
      // when two green candles confirm. Cleared on each fill, so a single deep drop
      // can't fill the whole ladder — every rung needs its own drop + confirmation.
      // Step-down: the FIRST rung (until it fills) keeps its trigger a fixed step
      // below the base the cycle armed on; deeper rungs step from the actual fills
      // (in onFill). stepArmed latches once price has reached the armed rung's
      // trigger, so the deeper rungs can't fire off a single fall.
      if (
        active &&
        !state.exitRequested &&
        dca.requireTwoGreen &&
        !active.stepArmed
      ) {
        const rung = active.rungs[active.armedIndex]
        if (rung && !rung.entryComplete && last.l <= rung.plannedPx) {
          state = { ...state, active: { ...active, stepArmed: true } }
        }
      }
      // Confirmation + fail-safe is a MARKET-mode concept. In limit mode the
      // rungs rest as limit orders and fill on their own (desiredOrders), so
      // there's no per-bar buy decision here.
      if (
        active &&
        !state.exitRequested &&
        !dca.requireTwoGreen &&
        dca.rungEntry === "market"
      ) {
        const close = last.c
        const pending = active.rungs.filter(
          (rung) =>
            !rung.entryComplete && !rung.entrySubmitted && rung.plannedPx >= close
        )
        if (pending.length === 0) {
          // Nothing confirmed — a recovery above the rungs ends any wait.
          if (active.waitingForGreen) {
            state = { ...state, active: { ...active, waitingForGreen: false } }
          }
        } else {
          const shallowest = pending.reduce((a, b) =>
            b.plannedPx > a.plannedPx ? b : a
          )
          const overshootPct =
            ((shallowest.plannedPx - close) / shallowest.plannedPx) * 100
          // Measure "too violent" against THIS rung's own step, so a ladder with
          // non-uniform deviations trips the fail-safe at each rung's real spacing
          // (identical to before for a uniform ladder).
          const spacing = shallowest.deviation
          const violent = overshootPct > VIOLENT_SPACING_MULTIPLE * spacing
          const green = last.c > last.o
          if (active.waitingForGreen) {
            // Waiting out a crash: buy the bounce only once a bar closes green.
            buyNow = green
            if (green) {
              state = { ...state, active: { ...active, waitingForGreen: false } }
            }
          } else if (violent) {
            state = { ...state, active: { ...active, waitingForGreen: true } }
            ctx.emit(
              "dca_failsafe",
              "DCA held off — a violent candle. Waiting for a green bar to buy the bounce."
            )
          } else {
            buyNow = true
          }
        }
      }

      // LIMIT mode: only the armed rung's limit rests. Advance to the next rung
      // one step per bar, and ONLY once the armed rung has filled — with the same
      // fail-safe: a violent bar makes the next rung wait for a green bar. So a
      // crash fills at most the one resting rung, then the deeper rungs follow
      // one at a time as price keeps stepping down.
      if (
        active &&
        !state.exitRequested &&
        !dca.requireTwoGreen &&
        dca.rungEntry === "limit"
      ) {
        const armed = active.rungs[active.armedIndex]
        const nextRung = active.rungs[active.armedIndex + 1]
        if (armed && armed.entryComplete && nextRung) {
          const close = last.c
          const overshootPct =
            ((nextRung.plannedPx - close) / nextRung.plannedPx) * 100
          // The next rung's own step, not rung 0's — see the market-mode note.
          const spacing = nextRung.deviation
          const violent = overshootPct > VIOLENT_SPACING_MULTIPLE * spacing
          const green = last.c > last.o
          if (active.waitingForGreen) {
            if (green) {
              state = {
                ...state,
                active: {
                  ...active,
                  armedIndex: active.armedIndex + 1,
                  waitingForGreen: false,
                },
              }
            }
          } else if (violent) {
            state = { ...state, active: { ...active, waitingForGreen: true } }
            ctx.emit(
              "dca_failsafe",
              "DCA held off — a violent candle. Waiting for a green bar before the next rung."
            )
          } else {
            state = {
              ...state,
              active: { ...active, armedIndex: active.armedIndex + 1 },
            }
          }
        }
      }

      ctx.setState({ ...state, buyNow })
    },
    onTick: (ctx) => {
      const pos = positionOf(ctx)
      const prevTrail = ctx.state.trail ?? null
      const trail = nextTrailState(prevTrail, pos, Number(ctx.mid))
      const state =
        trail === prevTrail ? ctx.state : { ...ctx.state, trail }
      if (state !== ctx.state) ctx.setState(state)
      if (state.exitRequested || pos.szi <= 0) return
      const hit = tickExit(closeProtection, pos, exitStateFor(state), Number(ctx.mid))
      if (!hit) return
      // Limit mode: on the bar a rung bought, only allow a profitable take-profit
      // to fill same-bar if the bar closed UP (a real recovery — the dip came
      // first, then the run-up). If the bar closed DOWN, the run-up couldn't have
      // followed the dip, so defer the take-profit. A stop (a loss) always fills.
      if (
        hit === "tp" &&
        dca.rungEntry === "limit" &&
        state.boughtThisBar &&
        barClosedDown(ctx)
      ) {
        return
      }
      ctx.setState({ ...state, exitRequested: true })
      ctx.emit("dca_exit", `DCA ${hit === "tp" ? "take profit" : "stop"} hit.`)
    },
    onFlatten: (ctx) => releaseCycle(ctx),
    onFill: (ctx, _params, fill) => {
      const active = ctx.state.active
      if (!active || !fill.purpose) return
      const buyIndex = purposeIndex(fill.purpose, "dca:b:")
      if (buyIndex !== null) {
        const fillPx = Number(fill.px)
        const complete =
          fill.orderStatus === "filled" || Number(fill.remainingSz) <= 0
        // Market mode: re-anchor the DEEPER rungs to step down from this actual
        // fill — each its own deviation below the one above it, starting from the
        // fill price. So after a crash bounce takes the first rung, the next rungs
        // sit a real step below the bounce and only trigger on genuine further
        // dips, not all at once off the stale pre-crash levels. The filled rung
        // keeps its planned level (peel/nearest targets read it). Limit mode keeps
        // its fixed resting levels.
        // Step the deeper rungs down from the actual fill in market mode AND in the
        // require-two-green step-down: each deeper rung sits its own deviation below
        // this fill, so the NEXT rung's trigger is "another step below where we just
        // bought" rather than a stale base-relative level.
        const restep =
          (dca.rungEntry === "market" || dca.requireTwoGreen) &&
          complete &&
          fillPx > 0
        let ref = fillPx
        const next = {
          ...active,
          hadFill: true,
          // Step-down mode: this rung filled — point at the next one and re-lock it,
          // so it can't buy until it has its own fresh drop plus two green candles.
          armedIndex:
            dca.requireTwoGreen && complete ? buyIndex + 1 : active.armedIndex,
          stepArmed:
            dca.requireTwoGreen && complete ? false : active.stepArmed,
          // The first buy of the cycle anchors the stop when that option is on.
          firstEntryPx:
            active.firstEntryPx ?? (fillPx > 0 ? fillPx : null),
          rungs: active.rungs.map((rung) => {
            if (rung.index === buyIndex) {
              return {
                ...rung,
                filledSz: rung.filledSz + Number(fill.sz),
                entrySubmitted: true,
                entryComplete: complete,
                // Step-down mode buys at the bounce, above the trigger level — so
                // record the ACTUAL fill as this rung's level, so the nearest/
                // previous-rung take-profit sells against real entries, not the
                // (lower) trigger it armed on. Other modes fill at the level.
                plannedPx:
                  dca.requireTwoGreen && fillPx > 0 ? fillPx : rung.plannedPx,
              }
            }
            if (restep && rung.index > buyIndex) {
              ref = ref * (1 - rung.deviation / 100)
              return { ...rung, plannedPx: ref }
            }
            return rung
          }),
        }
        ctx.setState({ ...ctx.state, active: next, boughtThisBar: true })
        return
      }
      if (fill.purpose === "dca:s:all") {
        // The single "sell everything at nearest rung" order filled. If it took
        // us flat the cycle is done; a partial fill just re-rests next tick.
        if (positionOf(ctx).szi <= EPSILON) {
          ctx.emit(
            "dca_cycle_complete",
            "DCA sold its whole position at the nearest rung."
          )
          releaseCycle(ctx)
        }
        return
      }
      const sellIndex = purposeIndex(fill.purpose, "dca:s:")
      if (sellIndex !== null) {
        // A peel-off sell filled — mark that rung sold. If it took us flat, the
        // cycle is done; otherwise keep going as price recovers.
        if (positionOf(ctx).szi <= EPSILON) {
          ctx.emit("dca_cycle_complete", "DCA sold its ladder back to flat.")
          releaseCycle(ctx)
        } else {
          ctx.setState({
            ...ctx.state,
            active: updateRung(active, sellIndex, (rung) => ({
              ...rung,
              soldSz: Math.min(rung.filledSz, rung.soldSz + Number(fill.sz)),
            })),
          })
        }
        return
      }
      if (fill.purpose === "dca:exit" && positionOf(ctx).szi <= EPSILON) {
        ctx.emit("dca_cycle_complete", "DCA closed its position.")
        releaseCycle(ctx)
      }
    },
    onOrderPlaced: (ctx, _params, order, status) => {
      const active = ctx.state.active
      if (!active) return
      const index = purposeIndex(order.purpose, "dca:b:")
      if (index === null) return
      ctx.setState({
        ...ctx.state,
        active: updateRung(active, index, (rung) => ({
          ...rung,
          entrySubmitted: true,
          entryComplete: status === "filled" || rung.entryComplete,
        })),
      })
    },
    onOrderRejected: (ctx, _params, order) => {
      const active = ctx.state.active
      if (!active) return
      const index = purposeIndex(order.purpose, "dca:b:")
      if (index !== null) {
        ctx.setState({
          ...ctx.state,
          active: updateRung(active, index, (rung) => ({
            ...rung,
            entrySubmitted: false,
          })),
        })
      } else if (order.purpose === "dca:exit") {
        ctx.setState({
          ...ctx.state,
          active: { ...active, lastExitAttemptAt: null },
        })
      }
    },
    exitTriggers: (ctx) => {
      const pos = positionOf(ctx)
      // The peel-off / nearest-rung sells are resting limit orders that fill on
      // the intrabar path, so only the stop loss needs a trigger level here.
      return pos.szi > 0 ? exitLevels(closeProtection, pos, exitStateFor(ctx.state)) : []
    },
    desiredOrders: (ctx) => {
      const state = ctx.state
      const positionSz = positionOf(ctx).szi
      const active = state.active
      if (!active) return []

      if (state.exitRequested) {
        if (positionSz <= EPSILON) {
          releaseCycle({ ...ctx, state })
          return []
        }
        if (
          active.lastExitAttemptAt !== null &&
          ctx.now - active.lastExitAttemptAt < EXIT_RETRY_MS
        ) {
          return []
        }
        ctx.setState({
          ...state,
          active: { ...active, lastExitAttemptAt: ctx.now },
        })
        return [marketExit(positionSz)]
      }

      const walletEquity = Number(ctx.equity)
      const midPx = Number(ctx.mid)
      const exposurePct = (px: number, sz: number) =>
        walletEquity > 0 ? ((px * sz) / walletEquity) * 100 : 0
      const filledExposurePct = exposurePct(midPx, Math.abs(positionSz))
      // Reserve only this market's live FILLED exposure — nothing is committed
      // until a rung actually fills, in either mode. Lets the room math below see
      // everyone else's real commitments.
      ctx.qflPortfolio?.setExposure?.(ctx.market, filledExposurePct)
      const roomPct = ctx.qflPortfolio?.remaining
        ? ctx.qflPortfolio.remaining(ctx.market)
        : Number.POSITIVE_INFINITY

      const orders: DesiredOrder[] = []

      // Limit mode: on the bar a rung just bought, hold its profitable exits off
      // the book ONLY if the bar closed DOWN — then a same-bar recovery to the
      // sell couldn't have followed the dip, so it can't round-trip for a gain.
      // On an UP bar the dip-then-recovery is plausible, so the exits stay and
      // the real same-bar win goes through. (Stops fire through exitTriggers.)
      const holdExits =
        dca.rungEntry === "limit" && state.boughtThisBar && barClosedDown(ctx)

      if (dca.requireTwoGreen) {
        // STEP-DOWN CONFIRMED entry: market-buy ONE rung once (a) price has fallen
        // to at least this rung's step below the reference — the base for the first
        // rung, the last fill for the rest — AND (b) the last two candles were both
        // green (greenUnlocked, latched at the prior close). The buy price must
        // STILL be at/below that step level (midPx <= plannedPx), so every rung is
        // genuinely ≥ its deviation below the buy above it — a shallow bounce that
        // has already recovered past the level doesn't buy; it waits for the next
        // dip, and if the position gets sold on that bounce the cycle just ends.
        // onFill steps the next rung down from this fill, so one fall never fills
        // more than one rung. The buy candle must both OPEN and be priced at/below
        // the step level: if it opened above the level (already bounced back up),
        // it doesn't buy — the whole candle has to sit ≥ the step below the last
        // rung, so the rung is genuinely that far down, not a shallow recovery.
        const curBar = ctx.candles(config.interval, 1).at(-1)
        const openPx = curBar ? Number(curBar.o) : midPx
        const rung = active.rungs[active.armedIndex]
        if (
          rung &&
          !rung.entryComplete &&
          // Live fills return async, so `entryComplete` isn't set until after the
          // order settles. Without this guard every tick between placing the
          // market buy and its fill re-satisfies the arm and fires ANOTHER
          // full-size buy (or re-buys the full budget after a partial). onOrderPlaced
          // sets entrySubmitted the moment it's placed, closing that window —
          // exactly how the plain market branch below guards itself.
          !rung.entrySubmitted &&
          active.stepArmed &&
          state.greenUnlocked &&
          midPx > 0 &&
          midPx <= rung.plannedPx &&
          openPx <= rung.plannedPx
        ) {
          const dollars = (active.frozenEquity * rung.allocationPct) / 100
          const sz = dollars / midPx
          if (
            sz > EPSILON &&
            filledExposurePct + exposurePct(midPx, sz) <= roomPct + 1e-9
          ) {
            orders.push({
              purpose: `dca:b:${rung.index}`,
              side: "buy",
              orderType: "market",
              sz: String(sz),
              tif: "Ioc",
              reduceOnly: false,
            })
          }
        }
      } else if (dca.rungEntry === "limit") {
        // LIMIT mode: rest ONLY the armed rung's limit at its EXACT level, so it
        // fills at that price (maker — no slippage) when price arrives. Only one
        // limit is ever on the book; onCandleClose advances the armed rung one
        // step per bar (gated by the fail-safe), so a crash fills at most this
        // one resting rung instead of cascading through the ladder. Nothing is
        // pre-reserved — only filled exposure counts, same as market mode.
        const next = active.rungs[active.armedIndex]
        if (next && !next.entryComplete) {
          const dollars = (active.frozenEquity * next.allocationPct) / 100
          const sz = dollars / next.plannedPx
          if (
            sz > EPSILON &&
            filledExposurePct + exposurePct(next.plannedPx, sz) <= roomPct + 1e-9
          ) {
            orders.push({
              purpose: `dca:b:${next.index}`,
              side: "buy",
              orderType: "limit",
              px: String(next.plannedPx),
              sz: String(sz),
              tif: "Gtc",
              reduceOnly: false,
              sizeIsRemaining: true,
            })
          }
        }
      } else if (state.buyNow && midPx > 0) {
        // MARKET mode: onCandleClose set `buyNow` when this bar's close confirmed
        // a rung (and cleared any fail-safe wait). We buy just ONE rung per bar —
        // the shallowest unbought rung price has reached — sized by its dollar
        // budget. So an orderly dip fills a rung a bar as it steps down, and after
        // a crash the fail-safe takes only the FIRST rung at the bounce, then the
        // rest fill one at a time — never the whole missed stack dumped in at the
        // bottom. Clear buyNow so intrabar re-evaluations never re-buy behind the
        // fail-safe's back.
        for (const rung of active.rungs) {
          if (rung.entryComplete || rung.entrySubmitted) continue
          if (rung.plannedPx < midPx) continue // not confirmed by this close
          const dollars = (active.frozenEquity * rung.allocationPct) / 100
          const sz = dollars / midPx
          if (sz <= EPSILON) continue
          if (filledExposurePct + exposurePct(midPx, sz) > roomPct + 1e-9) break
          orders.push({
            purpose: `dca:b:${rung.index}`,
            side: "buy",
            orderType: "market",
            sz: String(sz),
            tif: "Ioc",
            reduceOnly: false,
          })
          break // one rung per bar — the shallowest confirmed
        }
        ctx.setState({ ...state, buyNow: false })
      }

      // "Sell everything at nearest rung": rest ONE reduce-only sell for the
      // whole position at the nearest rung above the deepest filled buy (the base
      // when only the first buy is down). A bounce back to that single level
      // closes it all, and the level slides down as deeper rungs fill.
      if (nearestRung && positionSz > EPSILON && !holdExits) {
        const deepest = active.rungs.reduce(
          (max, rung) =>
            rung.filledSz - rung.soldSz > EPSILON
              ? Math.max(max, rung.index)
              : max,
          -1
        )
        const sellPx =
          deepest === 0
            ? active.base
            : active.rungs.find((rung) => rung.index === deepest - 1)?.plannedPx
        if (deepest >= 0 && sellPx !== undefined && sellPx > 0) {
          orders.push({
            purpose: "dca:s:all",
            side: "sell",
            orderType: "limit",
            px: String(sellPx),
            sz: String(positionSz),
            tif: "Gtc",
            reduceOnly: true,
            sizeIsRemaining: true,
          })
        }
      }

      // "Sell at previous rung": rest a reduce-only sell for each filled rung at
      // the price of the rung ABOVE it (the first rung at the base), so as price
      // recovers each averaged-in buy is sold where the buy above it was made.
      if (peelRungs && positionSz > EPSILON && !holdExits) {
        for (const rung of active.rungs) {
          const unsold = Math.max(0, rung.filledSz - rung.soldSz)
          if (unsold <= EPSILON) continue
          const sellPx =
            rung.index === 0
              ? active.base
              : active.rungs.find((other) => other.index === rung.index - 1)
                  ?.plannedPx
          if (sellPx === undefined || !(sellPx > 0)) continue
          orders.push({
            purpose: `dca:s:${rung.index}`,
            side: "sell",
            orderType: "limit",
            px: String(sellPx),
            sz: String(unsold),
            tif: "Gtc",
            reduceOnly: true,
            sizeIsRemaining: true,
          })
        }
      }
      return orders
    },
  }
}
