import {
  liquidationDistance,
  positionMargin,
  type TradePosition,
} from "@/lib/trade/paper"

export type WalletMarginHealth = {
  marginUsed: number
  nearest: { marketKey: string; away: number } | null
}

export function marginOf(position: TradePosition): number {
  return position.live ? position.live.marginUsed : positionMargin(position)
}

export function liquidationAwayOf(
  position: TradePosition,
  mark: number
): number | null {
  return liquidationDistance(position, mark)?.fraction ?? null
}

export function walletMarginHealth(
  positions: readonly TradePosition[],
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
