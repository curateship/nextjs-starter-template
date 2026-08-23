import {
  liquidationDistance,
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
  return liquidationDistance(position, mark)?.fraction ?? null
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
