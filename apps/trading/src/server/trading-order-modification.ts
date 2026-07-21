import type { ModifyOrderParams } from "@/server/hyperliquid/exchange"
import { roundSize } from "@/server/hyperliquid/rounding"
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

export function buildRiskBracketModifications({
  assetId,
  entry,
  stopOid,
  nextStopPrice,
  szDecimals,
  riskUsd,
}: {
  assetId: number
  entry: FrontendOpenOrder
  stopOid: number
  nextStopPrice: string
  szDecimals: number
  riskUsd?: number
}): {
  sz: string
  modifications: Array<{ oid: number; order: ModifyOrderParams }>
} {
  if (entry.isTrigger || entry.reduceOnly) {
    throw new Error("Risk sizing requires a pending entry order")
  }

  const stop = entry.children.find((child) => child.oid === stopOid)
  if (!stop) {
    throw new Error("Stop loss is no longer linked to its entry order")
  }
  const stopDescription = describeOpenOrder(stop).modification
  if (stopDescription.kind !== "trigger" || stopDescription.tpsl !== "sl") {
    throw new Error("Only a linked stop loss can resize a Risk order")
  }
  if (
    entry.children.some(
      (child) =>
        child.coin !== entry.coin ||
        !child.reduceOnly ||
        child.side === entry.side
    )
  ) {
    throw new Error("Linked order details do not match the entry order")
  }

  const entryPrice = Number(entry.limitPx)
  const currentStopPrice = Number(stop.triggerPx)
  const nextStop = Number(nextStopPrice)
  const currentSize = Number(entry.sz)
  const amountAtRisk =
    riskUsd ?? currentSize * Math.abs(entryPrice - currentStopPrice)
  const nextDistance = Math.abs(entryPrice - nextStop)
  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(nextStop) ||
    nextStop <= 0 ||
    !Number.isFinite(amountAtRisk) ||
    amountAtRisk <= 0
  ) {
    throw new Error("Risk order details are invalid")
  }
  if (nextDistance === 0) {
    throw new Error("Stop loss cannot equal the entry price")
  }

  const sz = roundSize(amountAtRisk / nextDistance, szDecimals)
  if (!(Number(sz) > 0)) {
    throw new Error("The new stop loss makes the order size too small")
  }

  return {
    sz,
    modifications: [entry, ...entry.children].map((order) => ({
      oid: order.oid,
      order: {
        ...buildModifiedOrder(
          assetId,
          order,
          order.oid === stopOid ? nextStopPrice : describeOpenOrder(order).price
        ),
        sz,
      },
    })),
  }
}

export function inferPreMarkerRiskUsd(
  originalEntry: { px: number; sz: number },
  originalStop: { px: number; sz: number },
  templates: ReadonlyArray<{
    sizingMode: "wallet" | "risk"
    stopLossPct: number | string
  }>
): number | null {
  if (originalEntry.sz !== originalStop.sz) return null

  const stopLossPct =
    (Math.abs(originalEntry.px - originalStop.px) / originalEntry.px) * 100
  const matchingTemplates = templates.filter(
    (template) => Math.abs(Number(template.stopLossPct) - stopLossPct) <= 0.05
  )
  if (
    matchingTemplates.length !== 1 ||
    matchingTemplates[0]?.sizingMode !== "risk"
  ) {
    return null
  }

  const riskUsd =
    originalEntry.sz * Math.abs(originalEntry.px - originalStop.px)
  return Number.isFinite(riskUsd) && riskUsd > 0 ? riskUsd : null
}

/**
 * A resting limit dragged through the mark — a buy above it or a sell below it
 * — can only ever fill instantly. Callers fill these at market instead of
 * resting them. This is the exact condition `assertPassiveLimitPrice` rejects.
 */
export function isMarketableDragPrice(
  nextPrice: string | number,
  mark: number,
  isBuy: boolean
): boolean {
  if (!Number.isFinite(mark) || mark <= 0) return false
  const price = Number(nextPrice)
  if (!Number.isFinite(price)) return false
  return isBuy ? price > mark : price < mark
}

export function assertPassiveLimitPrice(
  nextPrice: string,
  mark: number,
  isBuy: boolean
): void {
  if (!Number.isFinite(mark) || mark <= 0) {
    throw new Error("Current market price is unavailable")
  }
  const price = Number(nextPrice)
  if (isBuy ? price > mark : price < mark) {
    throw new Error(
      `${isBuy ? "Buy" : "Sell"} limit price must be at or ${isBuy ? "below" : "above"} mark (${mark}).`
    )
  }
}

function requireRestingTif(
  tif: FrontendOpenOrder["tif"]
): "Gtc" | "Ioc" | "Alo" {
  if (tif === "Gtc" || tif === "Ioc" || tif === "Alo") return tif
  throw new Error("Open limit order has an unsupported time-in-force")
}
