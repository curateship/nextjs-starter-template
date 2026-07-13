export function resolveOneClickEntryPrice({
  markPrice,
  useLimitOrder,
  limitPrice,
}: {
  markPrice: number
  useLimitOrder: boolean
  limitPrice?: string
}) {
  if (!(markPrice > 0)) {
    throw new Error("A current price is required")
  }

  if (!useLimitOrder) return markPrice

  const price = Number(limitPrice)
  if (!(price > 0)) {
    throw new Error("Right-click the chart to choose a limit price")
  }
  return price
}

export function resolveTakeProfitPrice({
  entryPrice,
  currentPrice,
  side,
  takeProfitPct,
}: {
  entryPrice: number
  currentPrice: number
  side: "buy" | "sell"
  takeProfitPct: number
}) {
  const referencePrice =
    side === "buy"
      ? Math.max(entryPrice, currentPrice)
      : Math.min(entryPrice, currentPrice)
  return (
    referencePrice *
    (side === "buy" ? 1 + takeProfitPct / 100 : 1 - takeProfitPct / 100)
  )
}
