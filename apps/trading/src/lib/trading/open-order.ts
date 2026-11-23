import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid/api/info"

export type FrontendOpenOrder = FrontendOpenOrdersResponse[number]

type CancellableOpenOrder = Pick<FrontendOpenOrder, "coin" | "oid">

export async function cancelOpenOrders(
  orders: readonly CancellableOpenOrder[],
  cancel: (order: CancellableOpenOrder) => Promise<unknown>
): Promise<number> {
  let cancelled = 0
  for (const order of orders) {
    try {
      await cancel(order)
      cancelled += 1
    } catch {
      // Continue so one rejected cancellation does not leave later orders open.
    }
  }
  return cancelled
}

export type OpenOrderDescription = {
  price: string
  label: "Buy" | "Sell" | "Stop Loss" | "Take Profit"
  modification:
    | {
        kind: "limit"
        tif: FrontendOpenOrder["tif"]
      }
    | {
        kind: "trigger"
        executionPx: string
        isMarket: boolean
        tpsl: "sl" | "tp"
      }
}

export function describeOpenOrder(
  order: FrontendOpenOrder
): OpenOrderDescription {
  if (!order.isTrigger) {
    if (order.orderType !== "Limit") {
      throw new Error(`Unsupported resting order type: ${order.orderType}`)
    }
    return {
      price: order.limitPx,
      label: order.side === "B" ? "Buy" : "Sell",
      modification: { kind: "limit", tif: order.tif },
    }
  }

  const trigger = describeTriggerType(order.orderType)
  return {
    price: order.triggerPx,
    label: trigger.tpsl === "sl" ? "Stop Loss" : "Take Profit",
    modification: {
      kind: "trigger",
      executionPx: order.limitPx,
      ...trigger,
    },
  }
}

/**
 * What a resting stop / target is worth in dollars if it fills.
 *
 * The chart label used to show the order's size in coins, which does not
 * answer the only question that matters when a stop is dragged: how much is
 * lost if it hits. A closing sell realizes the move up from the entry; a
 * closing buy (covering a short) realizes the move down.
 *
 * Returns null when the entry price is unknown — with no entry there is no
 * profit or loss to state, and a guess would be worse than saying nothing.
 */
export function triggerPnlUsd({
  triggerPx,
  entryPx,
  sz,
  side,
}: {
  triggerPx: number
  /** Average entry price of the position being closed. */
  entryPx: number | null
  /** Order size, in coins. */
  sz: number
  /** "B" = buy (covers a short), "A" = sell (closes a long). */
  side: "B" | "A"
}): number | null {
  if (entryPx === null) return null
  if (
    !Number.isFinite(triggerPx) ||
    !Number.isFinite(entryPx) ||
    !Number.isFinite(sz) ||
    entryPx <= 0 ||
    triggerPx <= 0 ||
    sz <= 0
  ) {
    return null
  }
  const move = side === "A" ? triggerPx - entryPx : entryPx - triggerPx
  return move * sz
}

function describeTriggerType(orderType: FrontendOpenOrder["orderType"]): {
  isMarket: boolean
  tpsl: "sl" | "tp"
} {
  switch (orderType) {
    case "Stop Market":
      return { isMarket: true, tpsl: "sl" }
    case "Stop Limit":
      return { isMarket: false, tpsl: "sl" }
    case "Take Profit Market":
      return { isMarket: true, tpsl: "tp" }
    case "Take Profit Limit":
      return { isMarket: false, tpsl: "tp" }
    default:
      throw new Error(`Unsupported trigger order type: ${orderType}`)
  }
}
