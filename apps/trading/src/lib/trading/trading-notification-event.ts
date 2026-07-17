export type TradingNotificationKind =
  | "position_opened"
  | "take_profit"
  | "stop_loss"
  /** A position's distance to liquidation dropped inside the saved threshold. */
  | "liquidation_risk"

export type PositionSide = "long" | "short"

export type TradingNotificationDraft = {
  kind: TradingNotificationKind
  coin: string
  side: PositionSide
  price: string
  size: string
  occurredAt: number
}

export type TradingFill = {
  oid: number
  coin: string
  px: string
  sz: string
  side: "B" | "A"
  startPosition: string
  time: number
}

export function triggerNotificationKind(
  orderType: string
): Exclude<TradingNotificationKind, "position_opened"> | null {
  if (orderType.startsWith("Take Profit ")) return "take_profit"
  if (orderType.startsWith("Stop ")) return "stop_loss"
  return null
}

export function classifyTradingFill(
  fill: TradingFill,
  triggerKinds: ReadonlyMap<
    number,
    Exclude<TradingNotificationKind, "position_opened">
  >
): TradingNotificationDraft | null {
  const triggerKind = triggerKinds.get(fill.oid)
  if (triggerKind) {
    return {
      kind: triggerKind,
      coin: fill.coin,
      side: Number(fill.startPosition) >= 0 ? "long" : "short",
      price: fill.px,
      size: fill.sz,
      occurredAt: fill.time,
    }
  }

  const startPosition = Number(fill.startPosition)
  const fillSize = Number(fill.sz)
  const endPosition = startPosition + (fill.side === "B" ? fillSize : -fillSize)
  const opensFromFlat = startPosition === 0
  const reversesPosition =
    endPosition !== 0 && Math.sign(startPosition) !== Math.sign(endPosition)

  if (!opensFromFlat && !reversesPosition) return null

  return {
    kind: "position_opened",
    coin: fill.coin,
    side: endPosition > 0 ? "long" : "short",
    price: fill.px,
    size: reversesPosition
      ? String(Number(Math.abs(endPosition).toPrecision(15)))
      : fill.sz,
    occurredAt: fill.time,
  }
}
