import type { TradePosition } from "@/lib/trade/paper"

/** Keep an existing target untouched when the chart adds a stop. */
export function bracketsWithStopAt(position: TradePosition, slPx: number) {
  return {
    targets: position.targets.map((target) => ({
      px: target.px,
      sz: target.sz,
    })),
    slPx,
  }
}
