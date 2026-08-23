import type { TradePosition } from "@/lib/trade/paper"

/** Keep an existing target untouched when the chart adds a stop. */
export function bracketsWithStopAt(position: TradePosition, slPx: number) {
  return {
    tpPx: position.tpPx,
    tpSz: position.tpSz ?? null,
    slPx,
  }
}
