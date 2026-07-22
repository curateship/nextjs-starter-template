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
  plannedPx: number
  targetSz: number
  filledSz: number
  /** Units of this rung already sold back (previous-rung take-profit). */
  soldSz: number
  entryMode: "market" | "limit"
  entrySubmitted: boolean
  entryComplete: boolean
}

type DcaCycle = {
  base: number
  startedAt: number
  frozenEquity: number
  rungs: DcaRungState[]
  hadFill: boolean
  lastExitAttemptAt: number | null
}

export type DcaAutomationState = {
  lastEvaluatedCandleTime: number | null
  baseTracker: QflBaseTracker | null
  /** A cracked base waiting for desiredOrders to size and place the ladder. */
  candidateBase: number | null
  candidateTime: number | null
  active: DcaCycle | null
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

/** The last closed candle just cracked a set percent below the current base. */
function crackedBelowBase(
  candles: IndicatorCandle[],
  dca: AutomationDcaConfig,
  currentBase: number | null,
  previousBase: number | null
): boolean {
  const index = candles.length - 1
  if (
    index < 1 ||
    currentBase === null ||
    previousBase === null ||
    !Number.isFinite(currentBase) ||
    !Number.isFinite(previousBase)
  ) {
    return false
  }
  const threshold = currentBase * (1 - dca.crackPct / 100)
  const previousThreshold = previousBase * (1 - dca.crackPct / 100)
  if (!(candles[index - 1].c >= previousThreshold && candles[index].c < threshold)) {
    return false
  }
  // Fast-fall gate: price must have been at/above the shelf within the last
  // maxCrackBars candles, so a slow bleed under the shelf doesn't count.
  const fastStart = Math.max(0, index - dca.maxCrackBars)
  return candles.slice(fastStart, index).some((candle) => candle.c >= currentBase)
}

function buildCycle(
  dca: AutomationDcaConfig,
  base: number,
  candleTime: number,
  equity: number,
  mid: number
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
    rungs: levels.map((plannedPx, index) => {
      // A rung already at or above the market fills now; deeper rungs rest.
      const crossed = mid <= plannedPx
      const sizingPx = crossed ? mid : plannedPx
      return {
        index,
        plannedPx,
        targetSz: (equity * allocations[index]) / 100 / sizingPx,
        filledSz: 0,
        soldSz: 0,
        entryMode: crossed ? "market" : "limit",
        entrySubmitted: false,
        entryComplete: false,
      }
    }),
    hadFill: false,
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
  // "Previous rung" take-profit: as price recovers, each averaged-in buy is
  // sold at the price of the buy above it (the first at the base). "Hold first"
  // keeps the first rung as free coins. In these modes the average take-profit
  // is replaced by the peel-off sells below, so only the stop loss still
  // force-closes the whole position.
  const previousRung =
    protection.takeProfitMode === "previousRungSellAll" ||
    protection.takeProfitMode === "previousRungHoldFirst"
  const holdFirstRung = protection.takeProfitMode === "previousRungHoldFirst"
  const closeProtection = previousRung
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

  const releaseCycle = (ctx: StrategyCtx<DcaAutomationState>) => {
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
    onCandleClose: (ctx) => {
      const candles = numericCandles(
        ctx.candles(config.interval, window).filter((candle) => candle.T <= ctx.now)
      )
      const last = candles.at(-1)
      if (!last || ctx.state.lastEvaluatedCandleTime === last.t) return
      if (candles.length < 3) return

      const baseTracker = updateBaseTracker(
        ctx.state.baseTracker,
        candles,
        dca,
        INTERVAL_MS[config.interval]
      )
      let state: DcaAutomationState = {
        ...ctx.state,
        lastEvaluatedCandleTime: last.t,
        baseTracker,
      }
      const currentBase = baseTracker.currentBase
      const previousBase = baseTracker.previousBase
      // A crack only qualifies if the market's past bases earn it (when the
      // Past-base-quality filter is on).
      const cracked =
        crackedBelowBase(candles, dca, currentBase, previousBase) &&
        respectQualifies(candles, dca, last.t)

      const closeSignal =
        closeConfig !== null &&
        evaluateAutomation(candles, closeConfig).actions.some(
          (action) => action.time === last.t && action.action === "close"
        )
      if (closeSignal && state.active) {
        ctx.setState({ ...state, exitRequested: true })
        return
      }

      if (state.active) {
        // The FIRST rung always sits under the NEWEST base: until that first
        // buy fills, re-arm the ladder onto any fresh, lower base that forms —
        // no second crack required (that was the bug: a new lower base would
        // form but the ladder kept firing off the old, higher one). Once the
        // first buy fills we're committed, and the deeper rungs stay counted
        // off that first base — they no longer move when the base does.
        if (
          !state.active.hadFill &&
          currentBase !== null &&
          currentBase < state.active.base
        ) {
          state = {
            ...state,
            active: null,
            candidateBase: currentBase,
            candidateTime: last.t,
          }
        }
        ctx.setState(state)
        return
      }

      // No cycle: a fresh crack while flat arms a new ladder (built in
      // desiredOrders, where equity and mid are available to size it).
      if (!state.candidateBase && positionOf(ctx).szi === 0 && cracked) {
        state = {
          ...state,
          candidateBase: currentBase,
          candidateTime: last.t,
        }
        ctx.emit("dca_candidate", "DCA found a base crack.", {
          base: currentBase,
        })
      }
      ctx.setState(state)
    },
    onTick: (ctx) => {
      const pos = positionOf(ctx)
      const prevTrail = ctx.state.trail ?? null
      const trail = nextTrailState(prevTrail, pos, Number(ctx.mid))
      const state =
        trail === prevTrail ? ctx.state : { ...ctx.state, trail }
      if (state !== ctx.state) ctx.setState(state)
      if (state.exitRequested || pos.szi <= 0) return
      const hit = tickExit(closeProtection, pos, state, Number(ctx.mid))
      if (!hit) return
      ctx.setState({ ...state, exitRequested: true })
      ctx.emit("dca_exit", `DCA ${hit === "tp" ? "take profit" : "stop"} hit.`)
    },
    onFlatten: (ctx) => releaseCycle(ctx),
    onFill: (ctx, _params, fill) => {
      const active = ctx.state.active
      if (!active || !fill.purpose) return
      const buyIndex = purposeIndex(fill.purpose, "dca:b:")
      if (buyIndex !== null) {
        const next = {
          ...updateRung(active, buyIndex, (rung) => ({
            ...rung,
            filledSz: rung.filledSz + Number(fill.sz),
            entrySubmitted: true,
            entryComplete:
              fill.orderStatus === "filled" || Number(fill.remainingSz) <= 0,
          })),
          hadFill: true,
        }
        ctx.setState({ ...ctx.state, active: next })
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
      // The peel-off sells are resting limit orders (they fill on the intrabar
      // path like the buy ladder), so only the stop loss needs a trigger here.
      return pos.szi > 0 ? exitLevels(closeProtection, pos, ctx.state) : []
    },
    desiredOrders: (ctx) => {
      let state = ctx.state
      const positionSz = positionOf(ctx).szi

      // Arm a fresh ladder from a candidate crack, sized against live equity.
      if (!state.active && state.candidateBase !== null && positionSz === 0) {
        const equity = Number(ctx.equity)
        const mid = Number(ctx.mid)
        if (!(equity > 0) || !(mid > 0)) return []
        state = {
          ...state,
          active: buildCycle(
            dca,
            state.candidateBase,
            state.candidateTime ?? ctx.now,
            equity,
            mid
          ),
          candidateBase: null,
          candidateTime: null,
        }
        ctx.setState(state)
        ctx.emit("dca_cycle_started", "DCA placed its buy ladder.")
      }

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

      const orders: DesiredOrder[] = []
      for (const rung of active.rungs) {
        const remaining = Math.max(0, rung.targetSz - rung.filledSz)
        if (rung.entryComplete || remaining <= EPSILON) continue
        // A market rung already submitted must not be re-sent every tick.
        if (rung.entryMode === "market" && rung.entrySubmitted) continue
        orders.push({
          purpose: `dca:b:${rung.index}`,
          side: "buy",
          orderType: rung.entryMode,
          ...(rung.entryMode === "limit" ? { px: String(rung.plannedPx) } : {}),
          sz: String(remaining),
          tif: rung.entryMode === "limit" ? "Gtc" : "Ioc",
          reduceOnly: false,
          sizeIsRemaining: rung.entryMode === "limit",
        })
      }

      // Previous-rung take-profit: rest a reduce-only sell for each filled rung
      // at the price of the rung ABOVE it (the first rung at the base), so as
      // price recovers each averaged-in buy is sold where the buy above it was
      // made. "Hold first" keeps the first rung (only the stop loss closes it).
      if (previousRung && positionSz > EPSILON) {
        for (const rung of active.rungs) {
          if (holdFirstRung && rung.index === 0) continue
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
