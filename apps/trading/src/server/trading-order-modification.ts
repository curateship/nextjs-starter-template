import type { ModifyOrderParams } from "@/server/hyperliquid/exchange"
import {
  describeOpenOrder,
  type FrontendOpenOrder,
} from "@/lib/trading/open-order"

export function buildModifiedOrder(
  assetId: number,
  order: FrontendOpenOrder,
  nextPrice: string
): ModifyOrderParams {
  const description = describeOpenOrder(order)
  const common = {
    assetId,
    coin: order.coin,
    isBuy: order.side === "B",
    sz: order.sz,
    reduceOnly: order.reduceOnly,
    ...(order.cloid ? { cloid: order.cloid } : {}),
  }

  if (description.modification.kind === "trigger") {
    const trigger = description.modification
    return {
      ...common,
      kind: "trigger",
      px: trigger.isMarket ? nextPrice : trigger.executionPx,
      triggerPx: nextPrice,
      isMarket: trigger.isMarket,
      tpsl: trigger.tpsl,
    }
  }

  return {
    ...common,
    kind: "limit",
    px: nextPrice,
    tif: requireRestingTif(description.modification.tif),
  }
}

export function assertMoveWithinMark(nextPrice: string, mark: number): void {
  if (!Number.isFinite(mark) || mark <= 0) {
    throw new Error("Current market price is unavailable")
  }
  const deviationPct = (Math.abs(Number(nextPrice) - mark) / mark) * 100
  if (deviationPct > 20) {
    throw new Error(
      `New price is ${deviationPct.toFixed(1)}% away from mark; refusing to move the order that far.`
    )
  }
}

function requireRestingTif(
  tif: FrontendOpenOrder["tif"]
): "Gtc" | "Ioc" | "Alo" {
  if (tif === "Gtc" || tif === "Ioc" || tif === "Alo") return tif
  throw new Error("Open limit order has an unsupported time-in-force")
}
