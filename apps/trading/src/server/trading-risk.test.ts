import { describe, expect, it } from "vitest"

import {
  BracketOrderError,
  buildCloid,
  cloidPrefixOf,
  cloidPurposeOf,
  MANUAL_CLOID_PREFIX,
  parseBracketOrderStatuses,
  RISK_SIZING_CLOID_PURPOSE,
  scrubErrorMessage,
} from "@/server/hyperliquid/exchange"
import {
  checkOrderIntent,
  describeViolations,
  STALE_PRICE_MS,
  type AccountRiskState,
  type OrderIntent,
  type PriceRef,
  type RiskLimits,
} from "@/server/risk/risk"
import {
  estimateLiquidationPx,
  previewOrder,
  usdToBaseSize,
} from "@/lib/order-preview"

const baseIntent: OrderIntent = {
  market: "ETH",
  side: "buy",
  orderType: "limit",
  px: "2000",
  sz: "1",
  reduceOnly: false,
  leverage: 5,
}

const baseAccount: AccountRiskState = {
  equity: "10000",
  positionSzi: "0",
  positionNotional: "0",
  openOrderCount: 0,
}

const baseLimits: RiskLimits = {
  maxPositionNotionalUsd: 10_000,
  maxLeverage: 10,
  maxOpenOrders: 20,
}

function freshRef(markPx = "2000"): PriceRef {
  const now = Date.now()
  return { markPx, priceTimestamp: now, now }
}

describe("risk engine", () => {
  it("accepts a sane order", () => {
    expect(
      checkOrderIntent(baseIntent, baseAccount, baseLimits, freshRef())
    ).toEqual({ ok: true })
  })

  it("rejects stale reference prices", () => {
    const now = Date.now()
    const result = checkOrderIntent(baseIntent, baseAccount, baseLimits, {
      markPx: "2000",
      priceTimestamp: now - STALE_PRICE_MS - 1,
      now,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.violations.map((violation) => violation.code)).toContain(
        "stale_price"
      )
    }
  })

  it("rejects orders that breach max notional, including existing position", () => {
    const result = checkOrderIntent(
      { ...baseIntent, sz: "4" },
      { ...baseAccount, positionSzi: "2", positionNotional: "4000" },
      baseLimits,
      freshRef()
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.violations[0].code).toBe("max_notional")
    }
  })

  it("allows large reduce-only orders that shrink the position", () => {
    const result = checkOrderIntent(
      { ...baseIntent, side: "sell", sz: "5", reduceOnly: true },
      { ...baseAccount, positionSzi: "6", positionNotional: "12000" },
      baseLimits,
      freshRef()
    )
    expect(result).toEqual({ ok: true })
  })

  it("rejects reduce-only orders in the wrong direction or oversize", () => {
    const wrongDirection = checkOrderIntent(
      { ...baseIntent, side: "buy", reduceOnly: true },
      { ...baseAccount, positionSzi: "1", positionNotional: "2000" },
      baseLimits,
      freshRef()
    )
    expect(wrongDirection.ok).toBe(false)

    const oversize = checkOrderIntent(
      { ...baseIntent, side: "sell", sz: "3", reduceOnly: true },
      { ...baseAccount, positionSzi: "1", positionNotional: "2000" },
      baseLimits,
      freshRef()
    )
    expect(oversize.ok).toBe(false)
    if (!oversize.ok) {
      expect(oversize.violations[0].code).toBe("reduce_only_size")
    }
  })

  it("rejects excessive leverage and open order count", () => {
    const leverage = checkOrderIntent(
      { ...baseIntent, leverage: 50 },
      baseAccount,
      baseLimits,
      freshRef()
    )
    expect(leverage.ok).toBe(false)

    const orders = checkOrderIntent(
      baseIntent,
      { ...baseAccount, openOrderCount: 20 },
      baseLimits,
      freshRef()
    )
    expect(orders.ok).toBe(false)
  })

  it("counts every order in a bracket against the open-order limit", () => {
    const result = checkOrderIntent(
      baseIntent,
      { ...baseAccount, openOrderCount: 18 },
      baseLimits,
      freshRef(),
      3
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.violations.map((violation) => violation.code)).toContain(
        "max_open_orders"
      )
    }
  })

  it("allows passive limit prices far from mark", () => {
    const buy = checkOrderIntent(
      { ...baseIntent, side: "buy", px: "1000" },
      baseAccount,
      baseLimits,
      freshRef()
    )
    const sell = checkOrderIntent(
      { ...baseIntent, side: "sell", px: "3000" },
      baseAccount,
      baseLimits,
      freshRef()
    )

    expect(buy).toEqual({ ok: true })
    expect(sell).toEqual({ ok: true })
  })

  it("rejects any limit price that crosses the current price", () => {
    const buy = checkOrderIntent(
      { ...baseIntent, px: "2000.01" },
      baseAccount,
      baseLimits,
      freshRef()
    )
    const sell = checkOrderIntent(
      { ...baseIntent, side: "sell", px: "1999.99" },
      baseAccount,
      baseLimits,
      freshRef()
    )

    expect(buy.ok).toBe(false)
    expect(sell.ok).toBe(false)
    if (!buy.ok && !sell.ok) {
      expect(buy.violations[0].code).toBe("price_sanity")
      expect(sell.violations[0].code).toBe("price_sanity")
      expect(describeViolations(buy.violations)).toContain("at or below mark")
      expect(describeViolations(sell.violations)).toContain("at or above mark")
    }
  })

  it("does not apply the limit-price rule to trigger orders", () => {
    const stopLoss = checkOrderIntent(
      { ...baseIntent, orderType: "trigger", side: "sell", px: "1000" },
      baseAccount,
      baseLimits,
      freshRef()
    )
    const takeProfit = checkOrderIntent(
      { ...baseIntent, orderType: "trigger", px: "3000" },
      baseAccount,
      baseLimits,
      freshRef()
    )

    expect(stopLoss).toEqual({ ok: true })
    expect(takeProfit).toEqual({ ok: true })
  })

  it("rejects non-positive size", () => {
    const result = checkOrderIntent(
      { ...baseIntent, sz: "0" },
      baseAccount,
      baseLimits,
      freshRef()
    )
    expect(result.ok).toBe(false)
  })
})

describe("order preview math", () => {
  it("computes notional, margin, and fees", () => {
    const preview = previewOrder({
      side: "buy",
      px: 2000,
      sz: 1.5,
      leverage: 10,
      maxLeverage: 50,
      isTaker: true,
    })
    expect(preview.notionalUsd).toBe(3000)
    expect(preview.marginRequiredUsd).toBe(300)
    expect(preview.estFeeUsd).toBeCloseTo(1.35, 5)
  })

  it("estimates liquidation below entry for longs and above for shorts", () => {
    const longLiq = estimateLiquidationPx("buy", 2000, 10, 50)
    const shortLiq = estimateLiquidationPx("sell", 2000, 10, 50)
    expect(longLiq).not.toBeNull()
    expect(shortLiq).not.toBeNull()
    expect(longLiq!).toBeLessThan(2000)
    expect(shortLiq!).toBeGreaterThan(2000)
    // 1x long cross of max-leverage buffer: 1/10 - 1/100 = 9% below entry
    expect(longLiq!).toBeCloseTo(2000 * 0.91, 5)
  })

  it("returns null liquidation when leverage leaves no buffer", () => {
    expect(estimateLiquidationPx("buy", 2000, 100, 50)).toBeNull()
  })

  it("converts USD size to base units", () => {
    expect(usdToBaseSize(1000, 2000)).toBe(0.5)
    expect(usdToBaseSize(1000, 0)).toBe(0)
  })
})

describe("cloid scheme", () => {
  it("builds 16-byte cloids with the caller's prefix", () => {
    const cloid = buildCloid(MANUAL_CLOID_PREFIX)
    expect(cloid).toMatch(/^0x[0-9a-f]{32}$/)
    expect(cloidPrefixOf(cloid)).toBe(MANUAL_CLOID_PREFIX)
  })

  it("marks Risk-sized one-click orders", () => {
    const cloid = buildCloid(MANUAL_CLOID_PREFIX, RISK_SIZING_CLOID_PURPOSE)
    expect(cloidPurposeOf(cloid)).toBe(RISK_SIZING_CLOID_PURPOSE)
  })

  it("rejects non-canonical client order IDs", () => {
    expect(() => cloidPurposeOf("ffffffff000100000000000000000000")).toThrow(
      "Invalid client order ID"
    )
  })

  it("generates unique cloids", () => {
    const seen = new Set(
      Array.from({ length: 100 }, () => buildCloid("abcd1234"))
    )
    expect(seen.size).toBe(100)
  })
})

describe("error scrubbing", () => {
  it("strips long hex strings and truncates", () => {
    const scrubbed = scrubErrorMessage(
      new Error(`Request failed: signature 0x${"ab".repeat(65)} rejected`)
    )
    expect(scrubbed).not.toContain("ab".repeat(65))
    expect(scrubbed).toContain("0x…")
    expect(scrubbed.length).toBeLessThanOrEqual(400)
  })

  it("strips a bare (un-prefixed) private-key-length hex run", () => {
    const bareKey = "cd".repeat(32) // 64 hex chars, no 0x prefix
    const scrubbed = scrubErrorMessage(new Error(`leaked key ${bareKey} oops`))
    expect(scrubbed).not.toContain(bareKey)
  })
})

describe("bracket order responses", () => {
  it("reports an accepted entry when a protection order fails", () => {
    try {
      parseBracketOrderStatuses([
        { filled: { oid: 1, avgPx: "2000", totalSz: "1" } },
        { error: "Take-profit rejected" },
        { resting: { oid: 3 } },
      ])
      throw new Error("Expected bracket parsing to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(BracketOrderError)
      expect((error as BracketOrderError).entryStatus).toBe("accepted")
    }
  })

  it("returns the entry status only when every bracket leg succeeds", () => {
    expect(
      parseBracketOrderStatuses([
        { filled: { oid: 1, avgPx: "2000", totalSz: "1" } },
        { resting: { oid: 2 } },
        { resting: { oid: 3 } },
      ])
    ).toEqual({
      kind: "filled",
      oid: 1,
      avgPx: "2000",
      totalSz: "1",
    })
  })

  it("accepts protective orders waiting for their trigger", () => {
    expect(
      parseBracketOrderStatuses([
        { filled: { oid: 1, avgPx: "2000", totalSz: "1" } },
        "waitingForTrigger",
        "waitingForTrigger",
      ])
    ).toEqual({
      kind: "filled",
      oid: 1,
      avgPx: "2000",
      totalSz: "1",
    })
  })
})
