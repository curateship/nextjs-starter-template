import { describe, expect, it } from "vitest"

import { diffOrders, type ExistingOrder } from "./order-differ"
import type { DesiredOrder } from "./strategies/contract"

function desired(overrides: Partial<DesiredOrder> = {}): DesiredOrder {
  return {
    purpose: "grid:1:buy",
    side: "buy",
    orderType: "limit",
    px: "2000",
    sz: "0.5",
    tif: "Gtc",
    reduceOnly: false,
    ...overrides,
  }
}

function existing(overrides: Partial<ExistingOrder> = {}): ExistingOrder {
  return {
    cloid: "0xabc",
    purpose: "grid:1:buy",
    side: "buy",
    px: "2000",
    sz: "0.5",
    remainingSz: "0.5",
    tif: "Gtc",
    reduceOnly: false,
    ...overrides,
  }
}

describe("order differ", () => {
  it("keeps unchanged orders", () => {
    expect(diffOrders([desired()], [existing()])).toEqual([])
  })

  it("places missing orders and cancels extras", () => {
    const actions = diffOrders(
      [desired({ purpose: "grid:2:sell", side: "sell", px: "2100" })],
      [existing()]
    )
    expect(actions).toHaveLength(2)
    expect(actions.some((a) => a.kind === "place")).toBe(true)
    expect(actions.some((a) => a.kind === "cancel")).toBe(true)
  })

  it("replaces orders whose price or size changed", () => {
    const actions = diffOrders([desired({ px: "1990" })], [existing()])
    expect(actions).toEqual([
      {
        kind: "replace",
        existing: existing(),
        desired: desired({ px: "1990" }),
      },
    ])
  })

  it("treats equal decimals with different formatting as unchanged", () => {
    expect(
      diffOrders([desired({ px: "2000.0", sz: "0.50" })], [existing()])
    ).toEqual([])
  })

  it("can compare a partial order by its remaining size", () => {
    expect(
      diffOrders(
        [desired({ sz: "0.3", sizeIsRemaining: true })],
        [existing({ remainingSz: "0.3" })]
      )
    ).toEqual([])
  })

  it("replaces on side or reduce-only flips", () => {
    const flipped = diffOrders([desired({ reduceOnly: true })], [existing()])
    expect(flipped[0].kind).toBe("replace")
  })

  it("always places market orders", () => {
    const actions = diffOrders(
      [desired({ orderType: "market", px: undefined, purpose: "momo:entry" })],
      []
    )
    expect(actions).toEqual([
      {
        kind: "place",
        desired: desired({
          orderType: "market",
          px: undefined,
          purpose: "momo:entry",
        }),
      },
    ])
  })
})
