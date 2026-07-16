import type { CandleWsEvent } from "@nktkas/hyperliquid"

import {
  type AutomationConfig,
  type AutomationQflConfig,
} from "@/lib/automations/automation"
import {
  automationFiltersAllowBuy,
  evaluateAutomation,
} from "@/lib/automations/evaluate"
import {
  advanceQflBaseTracker,
  createQflBaseTracker,
  findQflCandidateAtBase,
  hasMinimumMarketHistory,
  qflAllocationPcts,
  qflHistoryBars,
  qflLevels,
  qflProfitTarget,
  qflRequiredHistoryMonths,
  qflStopPrice,
  type QflBaseTracker,
  type QflCandidate,
} from "@/lib/automations/qfl"
import type { IndicatorCandle } from "@/lib/indicators/contract"

import type {
  DesiredOrder,
  Strategy,
  StrategyCtx,
} from "../strategies/contract"

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

type QflLevel = {
  index: number
  plannedPx: number
  allocationPct: number
  targetSz: number
  filledSz: number
  fillNotional: number
  exitedSz: number
  entryMode: "market" | "limit"
  entrySubmitted: boolean
  entryComplete: boolean
}

type QflCycle = {
  base: number
  startedAt: number
  frozenEquity: number
  stopPx: number | null
  expiresAt: number | null
  levels: QflLevel[]
  hadFill: boolean
  closingReason: "stop" | "time" | "close_signal" | null
  lastExitAttemptAt: number | null
}

export type QflAutomationState = {
  lastEvaluatedCandleTime: number | null
  baseTracker: QflBaseTracker | null
  candidate: QflCandidate | null
  active: QflCycle | null
}

const initialState = (): QflAutomationState => ({
  lastEvaluatedCandleTime: null,
  baseTracker: null,
  candidate: null,
  active: null,
})

function updateBaseTracker(
  current: QflBaseTracker | null,
  candles: IndicatorCandle[],
  qfl: AutomationQflConfig,
  intervalMs: number
): QflBaseTracker {
  const settingsChanged =
    current !== null &&
    (current.basePeriods !== qfl.basePeriods ||
      current.pumpPeriods !== qfl.pumpPeriods)
  let tracker =
    current && !settingsChanged
      ? current
      : createQflBaseTracker(qfl.basePeriods, qfl.pumpPeriods)
  let pending = candles.filter(
    (candle) =>
      tracker.processedTime === null || candle.t > tracker.processedTime
  )

  if (
    tracker.processedTime !== null &&
    pending[0] &&
    pending[0].t - tracker.processedTime > intervalMs * 1.5
  ) {
    tracker = createQflBaseTracker(qfl.basePeriods, qfl.pumpPeriods)
    pending = candles
  }

  for (const candle of pending) {
    tracker = advanceQflBaseTracker(tracker, candle)
  }
  return tracker
}

function purposeIndex(purpose: string, prefix: string): number | null {
  if (!purpose.startsWith(prefix)) return null
  const index = Number(purpose.slice(prefix.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function marketExit(sz: number): DesiredOrder {
  return {
    purpose: "qfl:exit",
    side: "sell",
    orderType: "market",
    sz: String(sz),
    tif: "Ioc",
    reduceOnly: true,
  }
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

function buildCycle(
  qfl: AutomationQflConfig,
  candidate: QflCandidate,
  equity: number,
  mid: number
): QflCycle {
  const levels = qflLevels(candidate.base, qfl)
  const allocations = qflAllocationPcts(qfl)
  return {
    base: candidate.base,
    startedAt: candidate.candleTime,
    frozenEquity: equity,
    stopPx: qfl.stopEnabled ? qflStopPrice(candidate.base, qfl) : null,
    expiresAt: qfl.timeExitEnabled
      ? candidate.candleTime + qfl.maxHoldHours * 3_600_000
      : null,
    levels: levels.map((plannedPx, index) => {
      const crossed = candidate.triggerPrice <= plannedPx
      const sizingPx = crossed ? mid : plannedPx
      return {
        index,
        plannedPx,
        allocationPct: allocations[index],
        targetSz: (equity * allocations[index]) / 100 / sizingPx,
        filledSz: 0,
        fillNotional: 0,
        exitedSz: 0,
        entryMode: crossed ? "market" : "limit",
        entrySubmitted: false,
        entryComplete: false,
      }
    }),
    hadFill: false,
    closingReason: null,
    lastExitAttemptAt: null,
  }
}

function cycleComplete(cycle: QflCycle) {
  return (
    cycle.hadFill &&
    cycle.levels.every(
      (level) =>
        level.filledSz <= EPSILON || level.exitedSz >= level.filledSz - EPSILON
    )
  )
}

function cycleOpenSize(cycle: QflCycle) {
  return cycle.levels.reduce(
    (sum, level) => sum + Math.max(0, level.filledSz - level.exitedSz),
    0
  )
}

function releaseCycle(ctx: StrategyCtx<QflAutomationState>) {
  ctx.qflPortfolio?.release(ctx.market)
  ctx.setState({
    ...ctx.state,
    candidate: null,
    active: null,
  })
}

function updateLevel(
  cycle: QflCycle,
  index: number,
  update: (level: QflLevel) => QflLevel
): QflCycle {
  return {
    ...cycle,
    levels: cycle.levels.map((level) =>
      level.index === index ? update(level) : level
    ),
  }
}

export function createQflAutomationStrategy(
  config: AutomationConfig
): Strategy<never, QflAutomationState> {
  const qfl = config.qfl
  if (!qfl) throw new Error("QFL configuration is required.")
  const historyMonths = qflRequiredHistoryMonths(qfl, config.marketScanner)
  const window = qflHistoryBars(qfl, config.interval, historyMonths)
  const scanWindow = qflHistoryBars(qfl, config.interval, 0)
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

  return {
    type: "automation",
    warmup: () => ({ candleIntervals: [config.interval] }),
    init: initialState,
    onStart: (ctx) => {
      const positionSz = Number(ctx.position?.szi ?? 0)
      if (positionSz !== 0 && !ctx.state.active) {
        throw new Error(
          "QFL bots cannot take ownership of an unexplained existing position."
        )
      }
      if (!ctx.state.active) return
      if (positionSz === 0 && ctx.state.active.hadFill) {
        releaseCycle(ctx)
        return
      }
      const expectedSz = cycleOpenSize(ctx.state.active)
      const tolerance = Math.max(EPSILON, expectedSz * 1e-6)
      if (
        !Number.isFinite(positionSz) ||
        Math.abs(positionSz - expectedSz) > tolerance
      ) {
        throw new Error(
          "QFL stopped because its saved ladder no longer matches the market position. Flatten it on the exchange before restarting."
        )
      }
      if (
        ctx.qflPortfolio &&
        !ctx.qflPortfolio.restore(ctx.market, qfl.maxMarketExposurePct)
      ) {
        throw new Error(
          "QFL shared exposure cannot restore this active ladder."
        )
      }
    },
    onCandleClose: (ctx) => {
      let candles = numericCandles(
        ctx
          .candles(config.interval, scanWindow)
          .filter((candle) => candle.T <= ctx.now)
      )
      const last = candles.at(-1)
      if (!last || ctx.state.lastEvaluatedCandleTime === last.t) return
      if (candles.length < 3) {
        ctx.qflPortfolio?.observe?.(ctx.market, last.t)
        return
      }

      let state: QflAutomationState = {
        ...ctx.state,
        lastEvaluatedCandleTime: last.t,
        baseTracker: updateBaseTracker(
          ctx.state.baseTracker,
          candles,
          qfl,
          INTERVAL_MS[config.interval]
        ),
      }
      const finish = (next: QflAutomationState) => {
        ctx.setState(next)
        ctx.qflPortfolio?.observe?.(ctx.market, last.t)
      }
      const closeSignal =
        closeConfig !== null &&
        evaluateAutomation(candles, closeConfig).actions.some(
          (action) => action.time === last.t && action.action === "close"
        )
      if (state.active) {
        if (closeSignal) {
          state = {
            ...state,
            active: { ...state.active, closingReason: "close_signal" },
          }
        } else if (
          state.active.expiresAt !== null &&
          ctx.now >= state.active.expiresAt
        ) {
          state = {
            ...state,
            active: { ...state.active, closingReason: "time" },
          }
          ctx.emit("qfl_time_exit", "QFL reached its maximum hold time.")
        }
        finish(state)
        return
      }
      // A basket candidate is valid only for its signal candle. If another
      // selected market missed that candle, ranking can never become ready;
      // expire it on the next close so this market can keep scanning.
      if (state.candidate && state.candidate.candleTime < last.t) {
        state = { ...state, candidate: null }
      }
      if (state.candidate || ctx.position) {
        finish(state)
        return
      }
      let candidate = findQflCandidateAtBase(
        candles,
        qfl,
        state.baseTracker?.currentBase ?? null,
        state.baseTracker?.previousBase ?? null
      )
      if (!candidate) {
        finish(state)
        return
      }
      // Six-month respect/history checks are expensive. The recent window is
      // enough to detect the crack; only load and score the long window after
      // a real candidate exists.
      if (window > scanWindow) {
        candles = numericCandles(
          ctx
            .candles(config.interval, window)
            .filter((candle) => candle.T <= ctx.now)
        )
        candidate = findQflCandidateAtBase(
          candles,
          qfl,
          state.baseTracker?.currentBase ?? null,
          state.baseTracker?.previousBase ?? null
        )
        if (!candidate) {
          finish(state)
          return
        }
      }
      if (
        config.marketScanner &&
        (candidate.dailyVolumeUsd < config.marketScanner.minDailyVolumeUsd ||
          (config.marketScanner.historyFilterEnabled &&
            !hasMinimumMarketHistory(
              candles,
              config.marketScanner.minHistoryMonths,
              last.t
            )))
      ) {
        finish(state)
        return
      }
      if (!automationFiltersAllowBuy(candles, qfl.filters ?? [])) {
        finish(state)
        return
      }
      ctx.qflPortfolio?.submit({
        market: ctx.market,
        candleTime: candidate.candleTime,
        exposurePct: qfl.maxMarketExposurePct,
        respectRate: candidate.respect.hasFullHistory
          ? candidate.respect.rate
          : null,
        volumeMultiple: candidate.volumeMultiple,
        dailyVolumeUsd: candidate.dailyVolumeUsd,
      })
      finish({ ...state, candidate })
      ctx.emit("qfl_candidate", "QFL found a qualifying panic crack.", {
        base: candidate.base,
        triggerPrice: candidate.triggerPrice,
        respectRate: candidate.respect.rate,
      })
    },
    onTick: (ctx) => {
      const active = ctx.state.active
      if (
        !active ||
        active.closingReason ||
        active.stopPx === null ||
        Number(ctx.position?.szi ?? 0) <= 0 ||
        Number(ctx.mid) > active.stopPx
      ) {
        return
      }
      ctx.setState({
        ...ctx.state,
        active: { ...active, closingReason: "stop" },
      })
      ctx.emit("qfl_stop", `QFL stop hit at ${active.stopPx}.`)
    },
    onFlatten: (ctx) => releaseCycle(ctx),
    onFill: (ctx, _params, fill) => {
      const active = ctx.state.active
      if (!active || !fill.purpose) return
      const buyIndex = purposeIndex(fill.purpose, "qfl:b:")
      const profitIndex = purposeIndex(fill.purpose, "qfl:tp:")
      let next = active
      if (buyIndex !== null) {
        const fillSize = Number(fill.sz)
        const fillPrice = Number(fill.px)
        next = updateLevel(next, buyIndex, (level) => ({
          ...level,
          filledSz: level.filledSz + fillSize,
          fillNotional: level.fillNotional + fillPrice * fillSize,
          entrySubmitted: true,
          entryComplete:
            fill.orderStatus === "filled" || Number(fill.remainingSz) <= 0,
        }))
        next = { ...next, hadFill: true }
      } else if (profitIndex !== null) {
        next = updateLevel(next, profitIndex, (level) => ({
          ...level,
          exitedSz: Math.min(level.filledSz, level.exitedSz + Number(fill.sz)),
        }))
      } else if (fill.purpose === "qfl:exit" && !ctx.position) {
        releaseCycle(ctx)
        return
      }
      if (cycleComplete(next)) {
        ctx.emit("qfl_cycle_complete", "QFL finished every filled buy.")
        releaseCycle({ ...ctx, state: { ...ctx.state, active: next } })
        return
      }
      ctx.setState({ ...ctx.state, active: next })
    },
    onOrderPlaced: (ctx, _params, order, status) => {
      const active = ctx.state.active
      if (!active) return
      const index = purposeIndex(order.purpose, "qfl:b:")
      if (index === null) return
      ctx.setState({
        ...ctx.state,
        active: updateLevel(active, index, (level) => ({
          ...level,
          entrySubmitted: true,
          entryComplete: status === "filled" || level.entryComplete,
        })),
      })
    },
    onOrderRejected: (ctx, _params, order) => {
      const active = ctx.state.active
      if (!active) return
      const index = purposeIndex(order.purpose, "qfl:b:")
      if (index !== null) {
        ctx.setState({
          ...ctx.state,
          active: updateLevel(active, index, (level) => ({
            ...level,
            entrySubmitted: false,
          })),
        })
      } else if (order.purpose === "qfl:exit") {
        ctx.setState({
          ...ctx.state,
          active: { ...active, lastExitAttemptAt: null },
        })
      }
    },
    exitTriggers: (ctx) => {
      const active = ctx.state.active
      return active &&
        !active.closingReason &&
        active.stopPx !== null &&
        Number(ctx.position?.szi ?? 0) > 0
        ? [active.stopPx]
        : []
    },
    desiredOrders: (ctx) => {
      let state = ctx.state
      if (!state.active && state.candidate) {
        if (
          ctx.qflPortfolio?.ready &&
          !ctx.qflPortfolio.ready(state.candidate.candleTime)
        ) {
          return []
        }
        const reserved = ctx.qflPortfolio
          ? ctx.qflPortfolio.reserve(
              ctx.market,
              state.candidate.candleTime,
              qfl.maxMarketExposurePct
            )
          : true
        if (!reserved) {
          ctx.emit(
            "qfl_exposure_skipped",
            "QFL skipped this crack because shared exposure was unavailable."
          )
          ctx.setState({ ...state, candidate: null })
          return []
        }
        const equity = Number(ctx.equity)
        const mid = Number(ctx.mid)
        if (!(equity > 0) || !(mid > 0)) {
          ctx.qflPortfolio?.release(ctx.market)
          ctx.setState({ ...state, candidate: null })
          return []
        }
        state = {
          ...state,
          candidate: null,
          active: buildCycle(qfl, state.candidate, equity, mid),
        }
        ctx.setState(state)
        ctx.emit("qfl_cycle_started", "QFL reserved and started its ladder.")
      }

      let active = state.active
      if (!active) return []
      const positionSz = Number(ctx.position?.szi ?? 0)
      if (active.closingReason) {
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
        active = { ...active, lastExitAttemptAt: ctx.now }
        ctx.setState({ ...state, active })
        return [marketExit(positionSz)]
      }

      const orders: DesiredOrder[] = []
      for (const level of active.levels) {
        const remainingEntry = Math.max(0, level.targetSz - level.filledSz)
        if (!level.entryComplete && remainingEntry > EPSILON) {
          if (!(level.entryMode === "market" && level.entrySubmitted)) {
            orders.push({
              purpose: `qfl:b:${level.index}`,
              side: "buy",
              orderType: level.entryMode,
              ...(level.entryMode === "limit"
                ? { px: String(level.plannedPx) }
                : {}),
              sz: String(remainingEntry),
              tif: level.entryMode === "limit" ? "Gtc" : "Ioc",
              reduceOnly: false,
              sizeIsRemaining: level.entryMode === "limit",
            })
          }
        }
        const remainingExit = Math.max(0, level.filledSz - level.exitedSz)
        if (remainingExit > EPSILON && level.fillNotional > 0) {
          const averageFill = level.fillNotional / level.filledSz
          orders.push({
            purpose: `qfl:tp:${level.index}`,
            side: "sell",
            orderType: "limit",
            px: String(qflProfitTarget(averageFill, active.base, qfl)),
            sz: String(remainingExit),
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
