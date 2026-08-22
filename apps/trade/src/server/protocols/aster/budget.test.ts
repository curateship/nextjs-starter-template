import { afterEach, describe, expect, it } from "vitest"

import {
  asterBudgetSnapshot,
  clearAsterBudgets,
  configureAsterBudget,
  observeAsterUsedWeight,
  reserveAsterRequest,
} from "@/server/protocols/aster/budget"

function exchangeInfo(requestLimit = 10, orderLimit = 2) {
  return {
    rateLimits: [
      {
        rateLimitType: "REQUEST_WEIGHT",
        interval: "MINUTE",
        intervalNum: 1,
        limit: requestLimit,
      },
      {
        rateLimitType: "ORDERS",
        interval: "MINUTE",
        intervalNum: 1,
        limit: orderLimit,
      },
    ],
  }
}

afterEach(() => {
  clearAsterBudgets()
})

describe("Aster's request budget", () => {
  it("releases spent weight at the rolling minute boundary", () => {
    configureAsterBudget("mainnet", exchangeInfo(), 1, 0)
    reserveAsterRequest(
      "mainnet",
      { weight: 7, lane: "public", priority: "background" },
      0
    )
    expect(() =>
      reserveAsterRequest(
        "mainnet",
        { weight: 1, lane: "public", priority: "background" },
        59_999
      )
    ).toThrow("EXCHANGE_BUSY")

    reserveAsterRequest(
      "mainnet",
      { weight: 8, lane: "public", priority: "background" },
      60_000
    )
    expect(asterBudgetSnapshot("mainnet", 60_000).used).toBe(8)
  })

  it("keeps the last fifth available for order work", () => {
    configureAsterBudget("mainnet", exchangeInfo(), 1, 0)
    reserveAsterRequest(
      "mainnet",
      { weight: 7, lane: "public", priority: "background" },
      0
    )
    expect(() =>
      reserveAsterRequest(
        "mainnet",
        { weight: 1, lane: "public", priority: "background" },
        0
      )
    ).toThrow("EXCHANGE_BUSY")

    reserveAsterRequest(
      "mainnet",
      { weight: 2, lane: "signed", priority: "order" },
      0
    )
    expect(asterBudgetSnapshot("mainnet", 0)).toEqual({
      limit: 10,
      used: 10,
      publicWeight: 8,
      signedWeight: 2,
    })
  })

  it("counts Aster's order allowance separately for each account", () => {
    configureAsterBudget("mainnet", exchangeInfo(100, 2), 1, 0)
    reserveAsterRequest(
      "mainnet",
      {
        weight: 1,
        lane: "signed",
        priority: "order",
        orders: 2,
        orderAccount: "first",
      },
      0
    )
    expect(() =>
      reserveAsterRequest(
        "mainnet",
        {
          weight: 1,
          lane: "signed",
          priority: "order",
          orders: 1,
          orderAccount: "first",
        },
        0
      )
    ).toThrow("EXCHANGE_BUSY")

    expect(() =>
      reserveAsterRequest(
        "mainnet",
        {
          weight: 1,
          lane: "signed",
          priority: "order",
          orders: 1,
          orderAccount: "second",
        },
        0
      )
    ).not.toThrow()
  })

  it("believes the IP total reported by Aster's response header", () => {
    configureAsterBudget("mainnet", exchangeInfo(100), 1, 0)
    observeAsterUsedWeight("mainnet", "80", 0)

    expect(() =>
      reserveAsterRequest(
        "mainnet",
        { weight: 1, lane: "public", priority: "background" },
        0
      )
    ).toThrow("EXCHANGE_BUSY")
    expect(asterBudgetSnapshot("mainnet", 0).used).toBe(80)
  })
})
