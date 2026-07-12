import type { ResolvedAutomationAction } from "@/lib/automations/automation"
import type { AutomationStrategyConfig } from "@/lib/automations/automation"
import { AUTOMATION_MAX_WINDOW_BARS } from "@/lib/automations/automation"
import type { IndicatorCandle } from "@/lib/indicators/contract"
import { evaluateAutomation } from "@/lib/automations/evaluate"
import { automationWarmupBars } from "@/lib/strategies/kinds/automation"

import type {
  DesiredOrder,
  Strategy,
  StrategyCtx,
} from "../strategies/contract"
import { exitLevels, tickExit } from "./trade-manager"


export type AutomationState = {
  pendingAction: ResolvedAutomationAction | null
  exitRequested: boolean
  lastEvaluatedCandleTime: number | null
}

function marketOrder(
  purpose: string,
  side: "buy" | "sell",
  sz: number,
  reduceOnly: boolean
): DesiredOrder {
  return {
    purpose,
    side,
    orderType: "market",
    sz: String(sz),
    tif: "Ioc",
    reduceOnly,
  }
}

/** One-time target adjustment produced by a completed-candle Automation action. */
export function automationTargetOrders(input: {
  mid: number
  equity: number
  positionSzi: number
  action: ResolvedAutomationAction
}): DesiredOrder[] {
  const { mid, equity, positionSzi, action } = input
  if (!(mid > 0) || !(equity > 0)) return []
  if (action.action === "close") {
    if (positionSzi === 0) return []
    return [
      marketOrder(
        "auto:close",
        positionSzi > 0 ? "sell" : "buy",
        Math.abs(positionSzi),
        true
      ),
    ]
  }

  if (action.action === "reverse") {
    // Flip whatever is held to the opposite side in one step. With no open
    // position there is nothing to reverse.
    if (positionSzi === 0) return []
    const side = positionSzi > 0 ? "sell" : "buy"
    const reversedSz = (equity * action.targetEquityPct) / 100 / mid
    return [
      marketOrder("auto:flip-close", side, Math.abs(positionSzi), true),
      marketOrder("auto:target-entry", side, reversedSz, false),
    ]
  }

  const targetSzi =
    ((equity * action.targetEquityPct) / 100 / mid) *
    (action.action === "buy" ? 1 : -1)
  if (positionSzi !== 0 && Math.sign(positionSzi) !== Math.sign(targetSzi)) {
    const side = targetSzi > 0 ? "buy" : "sell"
    return [
      marketOrder("auto:flip-close", side, Math.abs(positionSzi), true),
      marketOrder("auto:target-entry", side, Math.abs(targetSzi), false),
    ]
  }

  const delta = targetSzi - positionSzi
  if (Math.abs(delta * mid) < 0.01) return []
  const reducing =
    positionSzi !== 0 && Math.abs(targetSzi) < Math.abs(positionSzi)
  return [
    marketOrder(
      reducing ? "auto:target-reduce" : "auto:target-entry",
      delta > 0 ? "buy" : "sell",
      Math.abs(delta),
      reducing
    ),
  ]
}

export function createAutomationStrategy(
  config: AutomationStrategyConfig
): Strategy<never, AutomationState> {
  const window = Math.min(automationWarmupBars(config), AUTOMATION_MAX_WINDOW_BARS)
  const initialState = (): AutomationState => ({
    pendingAction: null,
    exitRequested: false,
    lastEvaluatedCandleTime: null,
  })
  const position = (ctx: StrategyCtx<AutomationState>) => ({
    szi: Number(ctx.position?.szi ?? 0),
    entryPx: Number(ctx.position?.entryPx ?? 0),
  })

  return {
    type: "automation",
    warmup: () => ({ candleIntervals: [config.interval] }),
    init: initialState,
    onCandleClose: (ctx) => {
      const raw = ctx
        .candles(config.interval, window)
        .filter((candle) => candle.T <= ctx.now)
      if (raw.length < 3) return
      const candles: IndicatorCandle[] = raw.map((candle) => ({
        t: candle.t,
        o: Number(candle.o),
        h: Number(candle.h),
        l: Number(candle.l),
        c: Number(candle.c),
        v: Number(candle.v),
      }))
      const lastTime = candles[candles.length - 1].t
      if (ctx.state.lastEvaluatedCandleTime === lastTime) return
      const evaluated = evaluateAutomation(candles, config)
      const actionEvent =
        evaluated.actions.find((action) => action.time === lastTime) ?? null
      const pendingAction: ResolvedAutomationAction | null = actionEvent
        ? actionEvent.action === "close"
          ? { action: "close" }
          : {
              action: actionEvent.action,
              targetEquityPct: actionEvent.targetEquityPct,
            }
        : null
      const warning = evaluated.warnings.find((item) => item.time === lastTime)
      ctx.setState({
        ...ctx.state,
        pendingAction,
        lastEvaluatedCandleTime: lastTime,
      })
      if (warning) ctx.emit("automation_conflict", warning.message)
      if (pendingAction) {
        const label =
          pendingAction.action === "close"
            ? "Close position"
            : pendingAction.action === "reverse"
              ? `Reverse ${pendingAction.targetEquityPct}%`
              : `${pendingAction.action === "buy" ? "Buy" : "Short"} ${pendingAction.targetEquityPct}%`
        ctx.emit(
          "automation_action",
          `${label} matched at ${candles[candles.length - 1].c}.`
        )
      }
    },
    onTick: (ctx) => {
      if (ctx.state.exitRequested) return
      const hit = tickExit(
        config.protection,
        position(ctx),
        ctx.state,
        Number(ctx.mid)
      )
      if (!hit) return
      ctx.setState({ ...ctx.state, pendingAction: null, exitRequested: true })
      ctx.emit(
        "exit",
        `${hit === "tp" ? "Take profit" : "Stop loss"} hit at ${ctx.mid}.`
      )
    },
    onFill: (ctx) => {
      if (!ctx.position) {
        ctx.setState({
          ...ctx.state,
          pendingAction: null,
          exitRequested: false,
        })
      }
    },
    exitTriggers: (ctx) =>
      exitLevels(config.protection, position(ctx), ctx.state),
    desiredOrders: (ctx) => {
      const action = ctx.state.exitRequested
        ? ({ action: "close" } as const)
        : ctx.state.pendingAction
      if (!action) return []
      ctx.setState({
        ...ctx.state,
        pendingAction: null,
        exitRequested: false,
      })
      return automationTargetOrders({
        mid: Number(ctx.mid),
        equity: Number(ctx.equity),
        positionSzi: position(ctx).szi,
        action,
      })
    },
  }
}
