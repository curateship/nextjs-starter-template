import type { DcaParams } from "@/lib/strategies/params"
import type { DesiredOrder, Strategy, StrategyCtx } from "./contract"

export type DcaState = {
  /** Price of the cycle's base fill; deviations anchor here. */
  anchorPx: number | null
  /** Safety order indices already filled this cycle. */
  filledSafeties: number[]
  exitRequested: boolean
  /** Compounding size multiplier, snapshotted when the cycle's base fills. */
  cycleScale: number
}

/**
 * Classic DCA/martingale cycle: a base order opens the position, laddered
 * safety orders average in as price moves against it, and one reduce-only
 * take-profit exits the whole position relative to average entry. When the
 * position closes, the cycle resets and a new base order goes out.
 */
export const dcaStrategy: Strategy<DcaParams, DcaState> = {
  type: "dca",

  warmup: () => ({ candleIntervals: [], needsBook: true, needsTrades: true }),

  init: () => ({
    anchorPx: null,
    filledSafeties: [],
    exitRequested: false,
    cycleScale: 1,
  }),

  onFill: (ctx, params, fill) => {
    const state = ctx.state
    if (fill.purpose === "dca:base") {
      // The base just opened the position (entry ≈ mid, so equity ≈ realized
      // cash) — snapshot the compounding scale to size this cycle's safeties.
      const start = Number(ctx.startingEquity)
      const balance = Number(ctx.equity)
      const cycleScale =
        params.compounding && start > 0 && balance > 0 ? balance / start : 1
      ctx.setState({
        anchorPx: Number(fill.px),
        filledSafeties: [],
        exitRequested: false,
        cycleScale,
      })
      return
    }
    const safetyMatch = fill.purpose?.match(/^dca:safety:(\d+)$/)
    if (safetyMatch) {
      const index = Number(safetyMatch[1])
      if (!state.filledSafeties.includes(index)) {
        ctx.setState({
          ...state,
          filledSafeties: [...state.filledSafeties, index],
        })
      }
      return
    }
    // Position closed (take-profit or stop) → new cycle.
    if (!ctx.position) {
      ctx.setState({
        anchorPx: null,
        filledSafeties: [],
        exitRequested: false,
        cycleScale: 1,
      })
      ctx.emit("cycle_done", `Cycle closed at ${fill.px}.`)
    }
  },

  onTick: (ctx, params) => {
    const state = ctx.state
    if (!params.stopLossPct || !state.anchorPx || !ctx.position) return
    if (state.exitRequested) return
    const mid = Number(ctx.mid)
    if (!(mid > 0)) return
    const long = params.direction === "long"
    const stopPx = long
      ? state.anchorPx * (1 - params.stopLossPct / 100)
      : state.anchorPx * (1 + params.stopLossPct / 100)
    const breached = long ? mid <= stopPx : mid >= stopPx
    if (breached) {
      ctx.setState({ ...state, exitRequested: true })
      ctx.emit(
        "stop_loss",
        `DCA stop hit at ${ctx.mid} (anchor ${state.anchorPx.toFixed(2)}, stop ${stopPx.toFixed(2)}).`
      )
    }
  },

  desiredOrders: (ctx: StrategyCtx<DcaState>, params: DcaParams) => {
    const state = ctx.state
    const mid = Number(ctx.mid)
    if (!(mid > 0)) return []
    const long = params.direction === "long"
    const entrySide = long ? "buy" : "sell"
    const exitSide = long ? "sell" : "buy"

    // Compounding scales the whole ladder with the account so it deploys more as
    // it grows and less as it shrinks; off = fixed sizes. The base is placed
    // while flat (equity == realized cash) so it scales live; the safeties rest
    // during an open position, so they use the scale snapshotted when the base
    // filled — otherwise unrealized-PnL wiggle would resize them every tick.
    const start = Number(ctx.startingEquity)
    const balance = Number(ctx.equity)
    const flatScale =
      params.compounding && start > 0 && balance > 0 ? balance / start : 1
    const baseOrderUsd = params.baseOrderUsd * flatScale
    const cycleScale = params.compounding ? (state.cycleScale ?? 1) : 1
    const safetyOrderUsd = params.safetyOrderUsd * cycleScale

    // Emergency exit: one reduce-only market order.
    if (state.exitRequested && ctx.position) {
      return [
        {
          purpose: "dca:stop",
          side: exitSide,
          orderType: "market",
          sz: String(Math.abs(Number(ctx.position.szi))),
          tif: "Ioc",
          reduceOnly: true,
        },
      ]
    }

    // Flat: rest the base order at mid to open the next cycle.
    if (!ctx.position || Number(ctx.position.szi) === 0) {
      return [
        {
          purpose: "dca:base",
          side: entrySide,
          orderType: "limit",
          px: String(mid),
          sz: String(baseOrderUsd / mid),
          tif: "Gtc",
          reduceOnly: false,
        },
      ]
    }

    const anchor = state.anchorPx ?? Number(ctx.position.entryPx)
    const orders: DesiredOrder[] = []

    // Unfilled safety orders, martingale-spaced and sized from the anchor:
    // step_i = priceStepPct * stepMultiplier^(i-1), deviations accumulate.
    let deviation = 0
    for (let i = 1; i <= params.maxSafetyOrders; i += 1) {
      deviation += params.priceStepPct * params.stepMultiplier ** (i - 1)
      if (state.filledSafeties.includes(i)) continue
      const px = long
        ? anchor * (1 - deviation / 100)
        : anchor * (1 + deviation / 100)
      if (px <= 0) continue
      const usd = safetyOrderUsd * params.sizeMultiplier ** (i - 1)
      orders.push({
        purpose: `dca:safety:${i}`,
        side: entrySide,
        orderType: "limit",
        px: String(px),
        sz: String(usd / px),
        tif: "Gtc",
        reduceOnly: false,
      })
    }

    // Take-profit from average entry for the whole position.
    const avgEntry = Number(ctx.position.entryPx)
    const tpPx = long
      ? avgEntry * (1 + params.takeProfitPct / 100)
      : avgEntry * (1 - params.takeProfitPct / 100)
    orders.push({
      purpose: "dca:tp",
      side: exitSide,
      orderType: "limit",
      px: String(tpPx),
      sz: String(Math.abs(Number(ctx.position.szi))),
      tif: "Gtc",
      reduceOnly: true,
    })

    return orders
  },
}
