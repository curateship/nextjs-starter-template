import type { DcaStrategyConfig } from "@/lib/strategies/strategy-config"

import type { DesiredOrder, Strategy, StrategyCtx } from "../strategies/contract"

/**
 * Per-market ladder state. `anchorPx` pins the whole ladder to where the
 * cycle started so rung prices never drift bar to bar (falling back to the
 * position's average entry is exactly the drift bug documented in
 * workspace/tasks/dca-duplicate-fill-bug.md — never do that). `filledCount`
 * is how many rungs (base + safeties) have filled this cycle.
 */
export type DcaState = {
  anchorPx: number | null
  filledCount: number
}

const INITIAL_DCA_STATE: DcaState = { anchorPx: null, filledCount: 0 }

/**
 * The DCA ladder engine — the second implementation of the worker Strategy
 * contract, beside the signal engine. No indicator: when flat it anchors a
 * ladder at the current price (base order in at market, every safety resting
 * as a limit buy below), and while positioned it keeps a reduce-only limit
 * sell at takeProfitPct above the AVERAGE entry. All exits are resting
 * limits, so the backtest fills them at their exact price (maker) with no
 * intrabar-pause machinery needed.
 */
export function createDcaStrategy(
  config: DcaStrategyConfig
): Strategy<never, DcaState> {
  const params = config.dca

  /** Cumulative % below the anchor of safety rung i (1-based). */
  const rungDeviationPct = (rung: number): number => {
    let deviation = 0
    let step = params.priceStepPct
    for (let i = 1; i <= rung; i += 1) {
      deviation += step
      step *= params.stepMultiplier
    }
    return deviation
  }

  /** The unfilled safety rungs as resting limit buys below the anchor. */
  const safetyOrders = (anchorPx: number, filledCount: number): DesiredOrder[] => {
    const orders: DesiredOrder[] = []
    for (let i = Math.max(1, filledCount); i <= params.safetyOrders; i += 1) {
      const px = anchorPx * (1 - rungDeviationPct(i) / 100)
      if (!(px > 0)) break
      orders.push({
        purpose: `dca:s${i}`,
        side: "buy",
        orderType: "limit",
        px: String(px),
        sz: String((params.baseOrderUsd * params.sizeMultiplier ** i) / px),
        tif: "Gtc",
        reduceOnly: false,
      })
    }
    return orders
  }

  return {
    type: "dca",

    warmup: () => ({ candleIntervals: [config.interval] }),

    init: () => ({ ...INITIAL_DCA_STATE }),

    // Runs synchronously inside the runner's onFill before any DB write —
    // the state must reflect the fill before the next evaluate tick.
    onFill: (ctx: StrategyCtx<DcaState>, _params, fill) => {
      if (!ctx.position) {
        // Take-profit closed the stack; the next evaluate starts a new cycle.
        ctx.setState({ ...INITIAL_DCA_STATE })
        ctx.emit("exit", `Take profit filled at ${fill.px} — cycle complete.`)
        return
      }
      if (fill.side === "buy") {
        ctx.setState({ ...ctx.state, filledCount: ctx.state.filledCount + 1 })
      }
    },

    desiredOrders: (ctx: StrategyCtx<DcaState>) => {
      const mid = Number(ctx.mid)
      if (!(mid > 0)) return []
      const state = ctx.state
      const szi = Number(ctx.position?.szi ?? 0)
      if (szi < 0) return [] // never ours — the ladder only buys

      if (szi === 0) {
        if (state.anchorPx === null) {
          // Start a cycle: anchor the ladder here, base order in at market.
          ctx.setState({ anchorPx: mid, filledCount: 0 })
          ctx.emit("signal", `New DCA cycle anchored at ${mid}.`)
          return [
            {
              purpose: "dca:base",
              side: "buy",
              orderType: "market",
              sz: String(params.baseOrderUsd / mid),
              tif: "Ioc",
              reduceOnly: false,
            },
            ...safetyOrders(mid, 0),
          ]
        }
        // Base order sent but not filled yet — keep the ladder resting.
        return safetyOrders(state.anchorPx, state.filledCount)
      }

      const orders =
        state.anchorPx !== null
          ? safetyOrders(state.anchorPx, state.filledCount)
          : []
      // Sell the whole stack a step above the blended average entry. As
      // safeties fill, the average falls and the size grows — the differ
      // replaces the resting TP with the updated one.
      const entryPx = Number(ctx.position?.entryPx ?? 0)
      if (entryPx > 0) {
        orders.push({
          purpose: "dca:tp",
          side: "sell",
          orderType: "limit",
          px: String(entryPx * (1 + params.takeProfitPct / 100)),
          sz: String(szi),
          tif: "Gtc",
          reduceOnly: true,
        })
      }
      return orders
    },
  }
}
