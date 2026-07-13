import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid/api/info"

export type FrontendOpenOrder = FrontendOpenOrdersResponse[number]

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
