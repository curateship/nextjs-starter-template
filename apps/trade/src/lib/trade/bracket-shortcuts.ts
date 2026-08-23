import type { PaperPosition } from "@/lib/trade/paper"

/** Keep an existing target untouched when the chart adds a stop. */
export function bracketsWithStopAt(position: PaperPosition, slPx: number) {
  return {
    tpPx: position.tpPx,
    tpSz: position.tpSz ?? null,
    slPx,
  }
}
