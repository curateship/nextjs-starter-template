import type { CandleWsEvent } from "@nktkas/hyperliquid"

import {
  dcaHistoryBars,
  type AutomationConfig,
  type AutomationDcaConfig,
} from "@/lib/automations/automation"
import { dcaAllocationPcts, dcaLevels } from "@/lib/automations/dca"
import {
  automationFiltersAllowBuy,
  evaluateAutomation,
} from "@/lib/automations/evaluate"
import {
  advanceBaseTracker,
  createBaseTracker,
  type BaseTracker,
} from "@/lib/automations/dca-ladder"
import type { IndicatorCandle } from "@/lib/indicators/contract"
import { INDICATORS } from "@/lib/indicators/registry"
import { nextTrailState, type TrailState } from "@/lib/strategies/trailing-stop"

import type {
  DesiredOrder,
  Strategy,
  StrategyCtx,
} from "../strategies/contract"
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
  /** The base price the stop was sitting on when it fired, captured at that
   * moment so the reclaim watch below is against the level that actually cut
   * us — not wherever the tracker has moved to by the time the fill lands. */
  stoppedAtPx: number | null
  /**
   * Armed by a base stop when re-entry is switched on. `base` is the level that
   * was lost, `sz` the size that stop sold, `index` the rung to put back, and
   * `since` when price FIRST closed back above the base (null while it is still
   * under it). A close back below clears `since`, so the wait restarts.
   */
  reclaim: {
    base: number
    sz: number
    index: number
    since: number | null
  } | null
  lastExitAttemptAt: number | null
}

export type DcaAutomationState = {
  lastEvaluatedCandleTime: number | null
  baseTracker: BaseTracker | null
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
  /** Latched each close: are ALL the ladder's indicator confirmations bullish?
   * A rung will not buy while this is false, so the ladder stops averaging into
   * a fall as soon as its confirmations turn. True when none are configured. */
  confirmed: boolean
  /** One-shot: the reclaim wait completed at this candle's close, so
   * desiredOrders buys the stopped rung back. Cleared once it does. */
  reclaimNow: boolean
  /** TP/SL close requested by the trade-manager or a close signal. */
  exitRequested: boolean
  /** What asked for that close. Only the stop loss ("sl") can leave the ladder
   * standing for its next rung; everything else ends the cycle. */
  exitReason: "tp" | "sl" | "other" | null
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
  confirmed: true,
  reclaimNow: false,
  exitRequested: false,
  exitReason: null,
  trail: null,
})

/**
 * Trend gate: is the latest close above the average of the last `trendMaBars`
 * closes? The ladder only ever buys, so left ungated it averages down into a
 * falling market — it lost 5.07%/month across the Sep-2025 → Jul-2026 crash
 * while the median coin fell 66%. This keeps it out of one.
 *
 * Bars are counted on the bot's OWN timeframe, so 200 means 200 days at 1d and
 * 200 four-hour bars (about 33 days) at 4h. Needs the full window to judge:
 * without it, an early bar would compare against a handful of closes and let a
 * ladder in during exactly the fall this is meant to avoid.
 */
function trendVerdict(
  candles: IndicatorCandle[],
  dca: AutomationDcaConfig
): "up" | "down" | "unknown" {
  if (!dca.trendFilterEnabled) return "up"
  const bars = dca.trendMaBars
  if (candles.length < bars) return "unknown"
  const window = candles.slice(-bars)
  const average = window.reduce((sum, c) => sum + c.c, 0) / bars
  return (candles.at(-1)?.c ?? 0) > average ? "up" : "down"
}

/** Entry side: only a confirmed uptrend may START a ladder, so "unknown" (not
 * enough candles yet) blocks — the cautious direction. */
function trendQualifies(
  candles: IndicatorCandle[],
  dca: AutomationDcaConfig
): boolean {
  return trendVerdict(candles, dca) === "up"
}

/** Exit side: only a confirmed DOWNtrend may close an open ladder. "unknown"
 * must NOT close it — treating "I can't tell yet" as "the trend broke" would
 * dump a live position during warmup or after a gap in the candle feed. */
function trendBroke(
  candles: IndicatorCandle[],
  dca: AutomationDcaConfig
): boolean {
  return trendVerdict(candles, dca) === "down"
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
  current: BaseTracker | null,
  candles: IndicatorCandle[],
  dca: AutomationDcaConfig,
  intervalMs: number
): BaseTracker {
  const settingsChanged =
    current !== null &&
    (current.basePeriods !== dca.basePeriods ||
      current.pumpPeriods !== dca.pumpPeriods)
  let tracker =
    current && !settingsChanged
      ? current
      : createBaseTracker(dca.basePeriods, dca.pumpPeriods)
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
    tracker = createBaseTracker(dca.basePeriods, dca.pumpPeriods)
    pending = candles
  }
  for (const candle of pending) tracker = advanceBaseTracker(tracker, candle)
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
    stoppedAtPx: null,
    reclaim: null,
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
  const window = dcaHistoryBars(dca)
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
  // Indicator confirmations wired into the ladder. Empty for every ladder that
  // doesn't use them, which keeps the hot path exactly as it was.
  const confirmations = dca.confirmations ?? []
  // How far back a confirmation may look. `maxAgeBars` (a Look Back wired above
  // the indicator) makes it explicit: the signal counts for that many candles and
  // then goes stale. When EVERY confirmation says so, the slice is exact and
  // cheap — warm-up plus that age.
  //
  // With no age set, `automationFiltersAllowBuy` means "the most recent signal
  // ever, however old", which needs the whole history. That is both slow AND
  // fragile: the answer silently depended on how long the ladder's window
  // happened to be, so switching on the trend gate (which lengthens it) changed
  // what "confirmed" meant. Fall back to the full window so the meaning stays
  // correct, and prefer to set an age.
  const confirmationsHaveAges =
    confirmations.length > 0 &&
    confirmations.every((filter) => filter.maxAgeBars !== undefined)
  const confirmWindow =
    confirmations.length === 0
      ? 0
      : confirmationsHaveAges
        ? Math.max(
            ...confirmations.map((filter) => {
              const module = INDICATORS[filter.indicator.type]
              const params = module.paramsSchema.parse(filter.indicator.params)
              return (
                module.warmupBars(params as never) +
                (filter.maxAgeBars ?? 0) +
                10
              )
            })
          )
        : window
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
  // A stop set to the confirmed base sits at the level the base tracker is
  // carrying — the same dash the chart paints, from the same detection settings.
  // `resolveProtection` keeps the configured percent whenever the level is not
  // below the entry (it isn't a stop above it).
  const baseLevelConfig =
    closeProtection.stopLossLevel?.kind === "confirmedBase"
      ? closeProtection.stopLossLevel
      : null
  const stopAtBase = baseLevelConfig !== null
  // Re-entry: days price must spend back above a base this stop was cut at
  // before the trade goes back on. 0 = off, which is how it behaved before.
  const reclaimMs = (baseLevelConfig?.reclaimDays ?? 0) * 86_400_000

  const exitStateFor = (state: DcaAutomationState) => ({
    exitRequested: state.exitRequested,
    trail: state.trail,
    stopAnchorPx:
      closeProtection.stopAnchor === "first"
        ? (state.active?.firstEntryPx ?? null)
        : null,
    stopLevelPx: stopAtBase ? (state.baseTracker?.currentBase ?? 0) : null,
  })

  /**
   * Did this bar CLOSE at or above `px`?
   *
   * On the bar a rung just bought, this is the test for whether a profitable
   * same-bar exit is believable. A candle records open/high/low/close but not
   * the ORDER the high and low happened in, so "the wick reached my sell" is
   * not evidence the sell could have filled after the buy — the wick may have
   * come first. The close is the one price we know the bar ended at, so a close
   * at or beyond the exit means price genuinely got there and stayed.
   *
   * This replaced a looser test — "the bar closed up" — which let any green bar
   * through however far below the exit it finished. That is where the ladder's
   * repeated `1/(1-rung%)-1` gains came from (6.383% off the first rung, booked
   * hundreds of times): buy the bar's low, sell its high, on a bar that merely
   * closed green. See the one-candle profit trap in CLAUDE.md.
   */
  const closeReached = (
    ctx: StrategyCtx<DcaAutomationState>,
    px: number
  ): boolean => {
    const cur = ctx.candles(config.interval, 1).at(-1)
    return cur ? Number(cur.c) >= px : false
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

  /**
   * The stop just took the ladder flat. With the stop sitting on the confirmed
   * base, that is one rung's attempt failing — NOT the whole idea failing — so
   * if the ladder still has an unbought rung the CYCLE SURVIVES: same base, same
   * rung levels, nothing held and no stop resting while flat, waiting for the
   * next rung's level to buy again. Only when the rungs run out is there nothing
   * left to wait for, so the cycle ends and a fresh base has to confirm.
   *
   * Deliberately tied to the confirmed-base stop, which is opt-in. A ladder on a
   * plain percent stop keeps its old behaviour — the stop ends the cycle — so no
   * saved automation or frozen backtest changes underneath anyone.
   *
   * Returns true when it stepped down, meaning the caller must NOT release.
   */
  /**
   * What the reclaim watch should be, given the cycle a stop just closed. Null
   * when re-entry is off, or when nothing had actually filled (there is no
   * position to put back). The rung it names is the deepest one that bought —
   * the one the stop took out — so re-entering restores the ladder to exactly
   * where it stood, rather than skipping ahead to the next rung down.
   */
  const reclaimArmedBy = (
    cycle: DcaCycle,
    stoppedAtPx: number | null
  ): DcaCycle["reclaim"] => {
    if (reclaimMs <= 0 || !stoppedAtPx || stoppedAtPx <= 0) return null
    let index = -1
    let sz = 0
    for (const rung of cycle.rungs) {
      if (rung.filledSz <= EPSILON) continue
      sz += rung.filledSz
      if (rung.index > index) index = rung.index
    }
    if (index < 0 || sz <= EPSILON) return null
    return { base: stoppedAtPx, sz, index, since: null }
  }

  const stepDownAfterStop = (ctx: StrategyCtx<DcaAutomationState>): boolean => {
    const active = ctx.state.active
    if (!stopAtBase || ctx.state.exitReason !== "sl" || !active) return false
    // The level the stop sat at — the base price that was lost. Read before the
    // tracker moves on, so the watch below is against the level that cut us.
    const stoppedAtPx = active.stoppedAtPx
    const remaining = active.rungs.some(
      (rung) => !rung.entryComplete && !rung.entrySubmitted
    )
    if (!remaining) return false
    // Nothing is held, so this market's room goes back to the shared wallet even
    // though the ladder is still armed — it re-reserves when the next rung fills.
    ctx.sharedWalletPortfolio?.setExposure?.(ctx.market, 0)
    ctx.setState({
      ...ctx.state,
      exitRequested: false,
      exitReason: null,
      trail: null,
      active: {
        ...active,
        lastExitAttemptAt: null,
        // The stop sold everything, so the price the stop measures FROM has to
        // let go too. With `stopAnchor: "first"` the stop is measured from this
        // cycle's first buy; left standing after a stop it keeps pointing at a
        // position that no longer exists, while the next rung buys lower. The
        // stop then lands ABOVE what is actually held and fires the moment a
        // base confirms — the ladder is cut with the base perfectly intact,
        // over and over. Cleared here, it re-anchors to the next rung that
        // actually fills.
        firstEntryPx: null,
        // Watch the level that just cut us. If price reclaims it and HOLDS,
        // the break was a fakeout and the rung goes back on (below). Read from
        // `active` — the PRE-reset rungs — so it captures what was actually sold.
        reclaim: reclaimArmedBy(active, stoppedAtPx),
        // The stop sold everything, so the ladder holds nothing: every rung's
        // filled size goes back to zero. `entryComplete` stays, which is what
        // stops them buying again, and a peel/nearest-rung take profit can no
        // longer rest sells for coins that are gone.
        //
        // Zeroing `filledSz` is what keeps a repeated stop → reclaim → stop from
        // running away. It used to be left alone, so each reclaim's buy ADDED to
        // it, the next reclaim summed the inflated figure, and the position
        // doubled every round — SOLV reached $76,750 against a $25,000 pot.
        rungs: active.rungs.map((rung) => ({
          ...rung,
          filledSz: 0,
          soldSz: 0,
        })),
      },
    })
    ctx.emit(
      "dca_rung_stopped",
      "DCA stopped out of its rung — the ladder is waiting for the next one."
    )
    return true
  }

  const releaseCycle = (ctx: StrategyCtx<DcaAutomationState>) => {
    // Hand this market's room back to the shared wallet (no-op when running a
    // single market or a live bot, which have no shared portfolio).
    ctx.sharedWalletPortfolio?.release?.(ctx.market)
    ctx.setState({
      ...ctx.state,
      active: null,
      candidateBase: null,
      candidateTime: null,
      exitRequested: false,
      exitReason: null,
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
      // close rules, a gap in the feed, or the trend gate.
      const needsWindow =
        prevTracker === null ||
        settingsChanged ||
        // The trend gate only feeds the arm check, which can only fire while
        // idle, so the full window is only needed then — never on every bar of a
        // live cycle. Without this the arm check would see a one-bar window and
        // refuse every ladder.
        (dca.trendFilterEnabled &&
          (ctx.state.active === null || dca.exitOnTrendBreak)) ||
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
        // Same latch-at-close discipline as the two-green check: judged on
        // CLOSED candles so a rung fill mid-bar can't flip the verdict.
        confirmed:
          confirmations.length === 0
            ? true
            : automationFiltersAllowBuy(
                numericCandles(
                  ctx
                    .candles(config.interval, confirmWindow)
                    .filter((candle) => candle.T <= ctx.now)
                ),
                confirmations
              ),
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
      const baseArmable = currentBase !== null && last.c >= currentBase

      const closeSignal =
        closeConfig !== null &&
        evaluateAutomation(candles, closeConfig).actions.some(
          (action) => action.time === last.t && action.action === "close"
        )
      if (closeSignal && state.active) {
        ctx.setState({ ...state, exitRequested: true, exitReason: "other" })
        return
      }

      // GIVING UP. The ladder otherwise has no exit for a position that just
      // keeps falling — the stop is measured from the first buy and in practice
      // never fires, so losses accumulate as open bags instead of being realised.
      // This closes the cycle outright.
      if (state.active && positionOf(ctx).szi > EPSILON) {
        const brokeTrend =
          dca.exitOnTrendBreak &&
          dca.trendFilterEnabled &&
          trendBroke(candles, dca)
        if (brokeTrend) {
          ctx.setState({ ...state, exitRequested: true, exitReason: "other" })
          ctx.emit("dca_give_up", "DCA closed the ladder — the trend broke.")
          return
        }
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

      // RECLAIM. A base stop is armed with the level it was cut at. If price
      // closes back above that level and KEEPS closing above it for the
      // configured span, the break was a fakeout — the drop took the stops out
      // and price carried on — so the rung goes back on at the next order pass.
      //
      // Closes, not wicks, on purpose: a wick under the base is exactly the
      // noise this is meant to sit through, while a close under it means the
      // level genuinely failed again, so the wait restarts from zero.
      let reclaimNow = false
      if (state.active?.reclaim && positionSz === 0) {
        const watch = state.active.reclaim
        if (last.c > watch.base) {
          const since = watch.since ?? last.t
          if (last.t - since >= reclaimMs) {
            reclaimNow = true
          } else if (watch.since === null) {
            state = {
              ...state,
              active: { ...state.active, reclaim: { ...watch, since } },
            }
          }
        } else if (watch.since !== null) {
          state = {
            ...state,
            active: { ...state.active, reclaim: { ...watch, since: null } },
          }
        }
      }

      // Arm: a confirmed base with price at/above it earmarks a fresh ladder.
      if (
        !state.active &&
        state.candidateBase === null &&
        positionSz === 0 &&
        baseArmable &&
        trendQualifies(candles, dca)
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
            ctx.sharedWalletPortfolio?.remaining &&
            ctx.sharedWalletPortfolio.remaining(ctx.market) + 1e-9 <
              firstRungPct
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
            !rung.entryComplete &&
            !rung.entrySubmitted &&
            rung.plannedPx >= close
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
              state = {
                ...state,
                active: { ...active, waitingForGreen: false },
              }
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

      ctx.setState({ ...state, buyNow, reclaimNow })
    },
    onTick: (ctx) => {
      const pos = positionOf(ctx)
      const prevTrail = ctx.state.trail ?? null
      const trail = nextTrailState(prevTrail, pos, Number(ctx.mid))
      const state = trail === prevTrail ? ctx.state : { ...ctx.state, trail }
      if (state !== ctx.state) ctx.setState(state)
      if (state.exitRequested || pos.szi <= 0) return
      const hit = tickExit(
        closeProtection,
        pos,
        exitStateFor(state),
        Number(ctx.mid)
      )
      if (!hit) return
      // Limit mode: on the bar a rung bought, a profitable take-profit may only
      // fill same-bar if the bar CLOSED at or above the level being sold at —
      // proof price reached it and held, rather than a wick that may well have
      // come before the dip that bought. Otherwise defer to the next bar.
      // A stop (a loss) always fills; the trap only ever flatters results.
      if (
        hit === "tp" &&
        dca.rungEntry === "limit" &&
        state.boughtThisBar &&
        !closeReached(ctx, Number(ctx.mid))
      ) {
        return
      }
      ctx.setState({
        ...state,
        exitRequested: true,
        exitReason: hit,
        active:
          hit === "sl" && state.active
            ? {
                ...state.active,
                stoppedAtPx: state.baseTracker?.currentBase ?? null,
              }
            : state.active,
      })
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
          stepArmed: dca.requireTwoGreen && complete ? false : active.stepArmed,
          // The first buy of the cycle anchors the stop when that option is on.
          firstEntryPx: active.firstEntryPx ?? (fillPx > 0 ? fillPx : null),
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
        if (stepDownAfterStop(ctx)) return
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
      return pos.szi > 0
        ? exitLevels(closeProtection, pos, exitStateFor(ctx.state))
        : []
    },
    desiredOrders: (ctx) => {
      const state = ctx.state
      const positionSz = positionOf(ctx).szi
      const active = state.active
      if (!active) return []

      if (state.exitRequested) {
        if (positionSz <= EPSILON) {
          if (stepDownAfterStop({ ...ctx, state })) return []
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
      // Reserve what this market has SPENT — its cost basis — not what the
      // position is worth now. Marking it to market frees room that does not
      // exist in cash: spend $50k, watch it halve, and the ledger reads 50%
      // committed, so another market spends the "free" half. Measured across a
      // 592-coin basket that let one $50,000 wallet deploy $120,713 of cash
      // (241%); even a 137-coin basket reached 110%. The broker's blended entry
      // price times the held size IS the cash committed, so this bounds the
      // wallet the way a real account is bounded. Nothing is committed until a
      // rung actually fills, in either entry mode.
      const filledExposurePct = exposurePct(
        positionOf(ctx).entryPx,
        Math.abs(positionSz)
      )
      ctx.sharedWalletPortfolio?.setExposure?.(ctx.market, filledExposurePct)
      const roomPct = ctx.sharedWalletPortfolio?.remaining
        ? ctx.sharedWalletPortfolio.remaining(ctx.market)
        : Number.POSITIVE_INFINITY

      const orders: DesiredOrder[] = []

      // Limit mode: on the bar a rung just bought, a profitable exit only rests
      // if the bar CLOSED at or above it. Anything else would let the ladder buy
      // the bar's low and sell its high off one candle, which the data cannot
      // support. (Stops fire through exitTriggers and are unaffected.)
      const boughtThisBar = dca.rungEntry === "limit" && state.boughtThisBar
      const exitAllowed = (px: number) =>
        !boughtThisBar || closeReached(ctx, px)

      // RECLAIM BUY. Price held back above the base this ladder was stopped at
      // for the configured span, so the rung the stop took out goes straight
      // back on — at market, same size, right here rather than waiting for
      // price to fall to a rung level again (it is above the base now, so it
      // never would). The stop that follows sits under whatever base is in
      // force by then, which is the ordinary behaviour from that point on.
      if (state.reclaimNow && state.active?.reclaim && positionSz === 0) {
        const watch = state.active.reclaim
        // Capped in DOLLARS, not coins. Buying back the same coin count would
        // spend more the further price has run since the stop — SUI reclaimed
        // 266 days later at 3.4x the stop price — so it is held to the budget of
        // the rung it is putting back, like every other buy in the ladder.
        const rung = state.active.rungs.find((r) => r.index === watch.index)
        const budget = rung
          ? (state.active.frozenEquity * rung.allocationPct) / 100
          : null
        const sz =
          budget !== null && midPx > 0
            ? Math.min(watch.sz, budget / midPx)
            : watch.sz
        if (
          midPx > 0 &&
          sz > EPSILON &&
          filledExposurePct + exposurePct(midPx, sz) <= roomPct + 1e-9
        ) {
          ctx.setState({
            ...state,
            reclaimNow: false,
            active: { ...state.active, reclaim: null, stoppedAtPx: null },
          })
          ctx.emit(
            "dca_reclaim",
            "DCA is buying back in — price reclaimed the base it was stopped at and held it."
          )
          return [
            {
              purpose: `dca:b:${watch.index}`,
              side: "buy",
              orderType: "market",
              sz: String(sz),
              tif: "Ioc",
              reduceOnly: false,
            },
          ]
        }
      }

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
          state.confirmed &&
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
        if (next && !next.entryComplete && state.confirmed) {
          const dollars = (active.frozenEquity * next.allocationPct) / 100
          const sz = dollars / next.plannedPx
          if (
            sz > EPSILON &&
            filledExposurePct + exposurePct(next.plannedPx, sz) <=
              roomPct + 1e-9
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
      } else if (state.buyNow && midPx > 0 && state.confirmed) {
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
      if (nearestRung && positionSz > EPSILON) {
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
        if (
          deepest >= 0 &&
          sellPx !== undefined &&
          sellPx > 0 &&
          exitAllowed(sellPx)
        ) {
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
      if (peelRungs && positionSz > EPSILON) {
        for (const rung of active.rungs) {
          const unsold = Math.max(0, rung.filledSz - rung.soldSz)
          if (unsold <= EPSILON) continue
          const sellPx =
            rung.index === 0
              ? active.base
              : active.rungs.find((other) => other.index === rung.index - 1)
                  ?.plannedPx
          if (sellPx === undefined || !(sellPx > 0)) continue
          // Each peel level is judged on its own: the close may confirm a
          // shallow one while a deeper one stays unproven.
          if (!exitAllowed(sellPx)) continue
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
