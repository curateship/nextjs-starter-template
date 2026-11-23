/**
 * A limit priced through the market — a buy above the mark or a sell below it —
 * can only ever fill instantly, so it is sent as a market order rather than
 * resting on the book. Shared by the order ticket (labelling) and the server
 * (routing) so both agree on what counts as marketable.
 */
export function isMarketableLimit(
  order: {
    orderType: "market" | "limit"
    side: "buy" | "sell"
    px?: string | null
    tif: "Gtc" | "Ioc" | "Alo"
  },
  markPx: string | number
): boolean {
  // Post-only explicitly means "never take", so leave those alone.
  if (order.orderType !== "limit" || !order.px || order.tif === "Alo") {
    return false
  }
  const limit = Number(order.px)
  const mark = Number(markPx)
  if (!Number.isFinite(limit) || !Number.isFinite(mark) || mark <= 0) {
    return false
  }
  return order.side === "buy" ? limit > mark : limit < mark
}
