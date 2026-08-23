import type { PaperOrder } from "@/lib/trade/paper"

export type OrderCancelKind = "watch" | "live" | "paper"

/** The row itself decides which system owns its cancel command. */
export function orderCancelKind(
  order: Pick<PaperOrder, "watched" | "live"> | null
): OrderCancelKind {
  if (order?.watched) return "watch"
  if (order?.live) return "live"
  return "paper"
}
