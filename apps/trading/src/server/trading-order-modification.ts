import type { ModifyOrderParams } from "@/server/hyperliquid/exchange"
import {
  describeOpenOrder,
  type FrontendOpenOrder,
} from "@/lib/trading/open-order"
import {
  marketableLimitDeviationPct,
  MARKETABLE_LIMIT_SANITY_PCT,
} from "@/server/risk/risk"

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

export function assertMoveWithinMark(
  nextPrice: string,
  mark: number,
  isBuy: boolean
): void {
  if (!Number.isFinite(mark) || mark <= 0) {
    throw new Error("Current market price is unavailable")
  }
  const price = Number(nextPrice)
  const deviationPct = marketableLimitDeviationPct(
    isBuy ? "buy" : "sell",
    price,
    mark
  )
  if (deviationPct > MARKETABLE_LIMIT_SANITY_PCT) {
    throw new Error(
      `New ${isBuy ? "buy" : "sell"} price is ${deviationPct.toFixed(1)}% ${isBuy ? "above" : "below"} mark; refusing to move the order that far.`
    )
  }
}

function requireRestingTif(
  tif: FrontendOpenOrder["tif"]
): "Gtc" | "Ioc" | "Alo" {
  if (tif === "Gtc" || tif === "Ioc" || tif === "Alo") return tif
  throw new Error("Open limit order has an unsupported time-in-force")
}
