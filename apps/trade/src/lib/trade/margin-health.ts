import {
  liquidationAway,
  positionMargin,
  type PaperPosition,
} from "@/lib/trade/paper"

export type WalletMarginHealth = {
  marginUsed: number
  nearest: { marketKey: string; away: number } | null
}

export function marginOf(position: PaperPosition): number {
  return position.live ? position.live.marginUsed : positionMargin(position)
}

export function liquidationAwayOf(
  position: PaperPosition,
  mark: number
): number | null {
  if (!position.live) return liquidationAway(position, mark)
  const liquidationPrice = position.live.liquidationPx
  if (liquidationPrice === null || !(mark > 0)) return null
  return Math.abs(mark - liquidationPrice) / mark
}

export function walletMarginHealth(
  positions: readonly PaperPosition[],
  marks: ReadonlyMap<string, number>,
  fallbackMarks: ReadonlyMap<string, number>,
  walletId: string
): WalletMarginHealth | null {
  let marginUsed = 0
  let nearest: WalletMarginHealth["nearest"] = null
  let found = false

  for (const position of positions) {
    if (position.walletId !== walletId) continue
    found = true
    marginUsed += marginOf(position)
    const mark =
      marks.get(position.marketKey) ??
      fallbackMarks.get(position.marketKey) ??
      position.entryPx
    const away = liquidationAwayOf(position, mark)
    if (away !== null && (nearest === null || away < nearest.away)) {
      nearest = { marketKey: position.marketKey, away }
    }
  }

  return found ? { marginUsed, nearest } : null
}
