import { describe, expect, it } from "vitest"

import {
  classifyTradingFill,
  triggerNotificationKind,
} from "@/lib/trading/trading-notification-event"

const baseFill = {
  tid: 101,
  oid: 501,
  coin: "ETH",
  px: "1800",
  sz: "0.25",
  side: "B" as const,
  startPosition: "0",
  time: 1_700_000_000_000,
}

describe("classifyTradingFill", () => {
  it("identifies the first fill that opens a long position", () => {
    expect(classifyTradingFill(baseFill, new Map())).toEqual({
      kind: "position_opened",
      coin: "ETH",
      side: "long",
      price: "1800",
      size: "0.25",
      occurredAt: 1_700_000_000_000,
    })
  })

  it("identifies a take-profit fill by its exact trigger order ID", () => {
    const fill = {
      ...baseFill,
      oid: 700,
      side: "A" as const,
      startPosition: "0.25",
      px: "1900",
    }

    expect(classifyTradingFill(fill, new Map([[700, "take_profit"]]))).toEqual({
      kind: "take_profit",
      coin: "ETH",
      side: "long",
      price: "1900",
      size: "0.25",
      occurredAt: 1_700_000_000_000,
    })
  })

  it("identifies a stop-loss fill for a short position", () => {
    const fill = {
      ...baseFill,
      oid: 701,
      startPosition: "-0.25",
      px: "1850",
    }

    expect(classifyTradingFill(fill, new Map([[701, "stop_loss"]]))).toEqual({
      kind: "stop_loss",
      coin: "ETH",
      side: "short",
      price: "1850",
      size: "0.25",
      occurredAt: 1_700_000_000_000,
    })
  })

  it("ignores ordinary position reductions", () => {
    expect(
      classifyTradingFill(
        { ...baseFill, side: "A", startPosition: "0.5" },
        new Map()
      )
    ).toBeNull()
  })

  it("identifies the new side when one fill reverses a position", () => {
    expect(
      classifyTradingFill(
        {
          ...baseFill,
          side: "A",
          startPosition: "0.1",
          sz: "0.25",
        },
        new Map()
      )
    ).toEqual({
      kind: "position_opened",
      coin: "ETH",
      side: "short",
      price: "1800",
      size: "0.15",
      occurredAt: 1_700_000_000_000,
    })
  })
})

describe("triggerNotificationKind", () => {
  it("maps Hyperliquid trigger order types to notification kinds", () => {
    expect(triggerNotificationKind("Take Profit Market")).toBe("take_profit")
    expect(triggerNotificationKind("Take Profit Limit")).toBe("take_profit")
    expect(triggerNotificationKind("Stop Market")).toBe("stop_loss")
    expect(triggerNotificationKind("Stop Limit")).toBe("stop_loss")
    expect(triggerNotificationKind("Limit")).toBeNull()
  })
})
