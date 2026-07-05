/** Pure position/cash arithmetic shared by the paper broker and engine. */

export type PaperPositionState = { szi: number; entryPx: number } | null

export type PaperFillResult = {
  position: PaperPositionState
  cash: number
  fee: number
  closedPnl: number
}

export function applyPaperFill(
  position: PaperPositionState,
  cash: number,
  side: "buy" | "sell",
  px: number,
  sz: number,
  feeRate: number
): PaperFillResult {
  const fee = px * sz * feeRate
  const signed = side === "buy" ? sz : -sz
  const szi = position?.szi ?? 0
  const entryPx = position?.entryPx ?? 0
  let closedPnl = 0

  if (szi !== 0 && Math.sign(signed) !== Math.sign(szi)) {
    const closedSz = Math.min(Math.abs(signed), Math.abs(szi))
    closedPnl = (px - entryPx) * closedSz * Math.sign(szi)
  }

  const nextSzi = szi + signed
  let nextPosition: PaperPositionState
  if (nextSzi === 0) {
    nextPosition = null
  } else if (szi === 0 || Math.sign(nextSzi) !== Math.sign(szi)) {
    nextPosition = { szi: nextSzi, entryPx: px }
  } else if (Math.abs(nextSzi) > Math.abs(szi)) {
    nextPosition = {
      szi: nextSzi,
      entryPx: (entryPx * Math.abs(szi) + px * sz) / Math.abs(nextSzi),
    }
  } else {
    nextPosition = { szi: nextSzi, entryPx }
  }

  return { position: nextPosition, cash: cash + closedPnl - fee, fee, closedPnl }
}

/** Caps a reduce-only order at the current position; null = wrong direction. */
export function capReduceOnly(
  position: PaperPositionState,
  side: "buy" | "sell",
  sz: number
): number | null {
  const szi = position?.szi ?? 0
  const reduces = (szi > 0 && side === "sell") || (szi < 0 && side === "buy")
  if (!reduces) return null
  return Math.min(sz, Math.abs(szi))
}

/** Average fill price walking book depth; null when the book is empty. */
export function walkBookDepth(
  levels: { px: string; sz: string }[],
  sz: number
): number | null {
  if (levels.length === 0 || !(sz > 0)) return null
  let remaining = sz
  let notional = 0
  for (const level of levels) {
    const take = Math.min(remaining, Number(level.sz))
    notional += take * Number(level.px)
    remaining -= take
    if (remaining <= 0) break
  }
  if (remaining > 0) {
    notional += remaining * Number(levels[levels.length - 1].px)
  }
  return notional / sz
}
