import type { GridParams } from "@/lib/strategies/params"
import type { DesiredOrder, Strategy, StrategyCtx } from "./contract"

export type GridState = {
  stopped: boolean
  /** Compounding size multiplier, snapshotted while the grid is flat. */
  scale: number
}

/**
 * Neutral/directional grid. Levels are evenly spaced across
 * [lowerPx, upperPx]; every level below mid wants a resting buy, every
 * level above mid wants a resting sell (skipping the level closest to mid
 * so the spread isn't crossed). Re-arming after fills emerges naturally:
 * once a buy at level i fills and price sits near it, level i+1 is above
 * mid and becomes a desired sell. Long-only grids make sells reduce-only;
 * short-only grids mirror that.
 */
export const gridStrategy: Strategy<GridParams, GridState> = {
  type: "grid",

  warmup: () => ({
    candleIntervals: [],
    needsBook: true,
    needsTrades: true,
  }),

  init: () => ({ stopped: false, scale: 1 }),

  onTick: (ctx, params) => {
    if (ctx.state.stopped) return
    const mid = Number(ctx.mid)
    if (!(mid > 0)) return

    if (params.stopLossPx) {
      const stop = Number(params.stopLossPx)
      const breached =
        params.side === "short_only" ? mid >= stop : mid <= stop
      if (breached) {
        ctx.setState({ ...ctx.state, stopped: true })
        ctx.emit(
          "stop_loss",
          `Grid stop hit at ${ctx.mid} (stop ${params.stopLossPx}); flattening and halting.`
        )
        return
      }
    }

    if (params.takeProfitPx) {
      const target = Number(params.takeProfitPx)
      const reached =
        params.side === "short_only" ? mid <= target : mid >= target
      if (reached) {
        ctx.setState({ ...ctx.state, stopped: true })
        ctx.emit(
          "take_profit",
          `Grid take-profit hit at ${ctx.mid} (target ${params.takeProfitPx}); flattening and halting.`
        )
      }
    }
  },

  desiredOrders: (ctx: StrategyCtx<GridState>, params: GridParams) => {
    if (ctx.state.stopped) return []
    const mid = Number(ctx.mid)
    if (!(mid > 0)) return []

    const lower = Number(params.lowerPx)
    const upper = Number(params.upperPx)
    if (!(upper > lower)) return []

    const step = (upper - lower) / (params.levels - 1)
    const positionSzi = Number(ctx.position?.szi ?? 0)
    const orders: DesiredOrder[] = []
    let reduceBudget = Math.abs(positionSzi)

    // Compounding scales every level's size with the account, so the grid
    // deploys more as it grows and less as it shrinks; off = fixed per-level.
    // Snapshot the balance only while flat (equity == realized cash) and hold it
    // while inventory is open — otherwise unrealized-PnL wiggle would resize, and
    // so cancel/replace, every resting level each tick.
    let scale = params.compounding ? (ctx.state.scale ?? 1) : 1
    if (params.compounding && positionSzi === 0) {
      const start = Number(ctx.startingEquity)
      const balance = Number(ctx.equity)
      const next = start > 0 && balance > 0 ? balance / start : 1
      if (next !== scale) {
        scale = next
        ctx.setState({ ...ctx.state, scale })
      }
    }
    const sizePerLevelUsd = params.sizePerLevelUsd * scale

    for (let i = 0; i < params.levels; i += 1) {
      const px = lower + step * i
      // Skip the level hugging mid so we never cross our own spread.
      if (Math.abs(px - mid) < step / 2) continue

      const sz = sizePerLevelUsd / px
      if (px < mid) {
        if (params.side === "short_only") {
          // Buys only reduce an existing short.
          if (positionSzi < 0 && reduceBudget > 0) {
            const take = Math.min(sz, reduceBudget)
            reduceBudget -= take
            orders.push(level(i, "buy", px, take, true))
          }
        } else {
          orders.push(level(i, "buy", px, sz, false))
        }
      } else {
        if (params.side === "long_only") {
          // Sells only reduce an existing long.
          if (positionSzi > 0 && reduceBudget > 0) {
            const take = Math.min(sz, reduceBudget)
            reduceBudget -= take
            orders.push(level(i, "sell", px, take, true))
          }
        } else {
          orders.push(level(i, "sell", px, sz, false))
        }
      }
    }

    return orders
  },
}

function level(
  index: number,
  side: "buy" | "sell",
  px: number,
  sz: number,
  reduceOnly: boolean
): DesiredOrder {
  return {
    purpose: `grid:${index}:${side}`,
    side,
    orderType: "limit",
    px: String(px),
    sz: String(sz),
    tif: "Gtc",
    reduceOnly,
  }
}
