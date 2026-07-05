import type { CopyParams } from "@/lib/strategies/params"
import type { DesiredOrder, Strategy, StrategyCtx } from "./contract"

export type CopyState = {
  /** Highest source fill tid already mirrored (dedup watermark). */
  watermarkTid: number
  /** Fills waiting to be mirrored; consumed by desiredOrders. */
  pending: { side: "buy" | "sell"; sz: number; px: number }[]
}

/**
 * Mirrors the fills of a public Hyperliquid address on this bot's market.
 * Each source fill becomes a marketable IOC limit capped at maxSlippageBps
 * from the source price — never chase beyond that.
 */
export const copyStrategy: Strategy<CopyParams, CopyState> = {
  type: "copy",

  warmup: (params) => ({
    candleIntervals: [],
    needsBook: false,
    needsTrades: false,
    sourceAddress: params.sourceAddress,
  }),

  init: () => ({ watermarkTid: 0, pending: [] }),

  onSourceFill: (ctx, params, fill) => {
    const state = ctx.state
    if (fill.tid <= state.watermarkTid) return
    if (fill.coin !== ctx.market) {
      ctx.setState({ ...state, watermarkTid: fill.tid })
      return
    }
    if (
      params.marketsFilter &&
      params.marketsFilter.length > 0 &&
      !params.marketsFilter.includes(fill.coin)
    ) {
      ctx.setState({ ...state, watermarkTid: fill.tid })
      return
    }

    const px = Number(fill.px)
    const sourceSz = Number(fill.sz)
    const sz =
      params.sizeMode === "ratio"
        ? sourceSz * (params.ratio ?? 1)
        : (params.fixedUsd ?? 0) / px
    if (!(sz > 0) || !(px > 0)) return

    ctx.setState({
      watermarkTid: fill.tid,
      pending: [...state.pending, { side: fill.side, sz, px }],
    })
    ctx.emit(
      "source_fill",
      `Source ${fill.side} ${fill.sz} @ ${fill.px}; mirroring ${sz.toFixed(6)}.`
    )
  },

  desiredOrders: (ctx: StrategyCtx<CopyState>, params: CopyParams) => {
    const state = ctx.state
    if (state.pending.length === 0) return []

    const orders: DesiredOrder[] = state.pending.map((pending, index) => {
      const cap = params.maxSlippageBps / 10_000
      const limitPx =
        pending.side === "buy"
          ? pending.px * (1 + cap)
          : pending.px * (1 - cap)
      return {
        purpose: `copy:${state.watermarkTid}:${index}`,
        side: pending.side,
        orderType: "market",
        px: String(limitPx),
        sz: String(pending.sz),
        tif: "Ioc",
        reduceOnly: false,
      }
    })
    ctx.setState({ ...state, pending: [] })
    return orders
  },
}
