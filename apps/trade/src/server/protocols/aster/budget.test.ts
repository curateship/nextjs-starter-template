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

  it("accepts testnet's -2 marker as no stated request cap", () => {
    configureAsterBudget(
      "testnet",
      {
        rateLimits: [
          {
            rateLimitType: "REQUEST_WEIGHT",
            interval: "MINUTE",
            intervalNum: 1,
            limit: -2,
          },
          {
            rateLimitType: "ORDERS",
            interval: "MINUTE",
            intervalNum: 1,
            limit: -2,
          },
          {
            rateLimitType: "ORDERS",
            interval: "SECOND",
            intervalNum: 10,
            limit: 1_000,
          },
        ],
      },
      1,
      0
    )

    expect(() =>
      reserveAsterRequest(
        "testnet",
        { weight: 5, lane: "signed", priority: "background" },
        0
      )
    ).not.toThrow()
    expect(asterBudgetSnapshot("testnet", 0).limit).toBe(
      Number.POSITIVE_INFINITY
    )
  })

  it("keeps three account cards and a one-minute chart inside a normal minute", () => {
    configureAsterBudget("mainnet", exchangeInfo(2_400, 1_200), 1, 0)
    reserveAsterRequest(
      "mainnet",
      { weight: 1, lane: "public", priority: "background" },
      0
    )
    for (let cycle = 0; cycle < 4; cycle += 1) {
      for (let wallet = 0; wallet < 3; wallet += 1) {
        reserveAsterRequest(
          "mainnet",
          { weight: 5, lane: "signed", priority: "background" },
          cycle * 15_000
        )
        reserveAsterRequest(
          "mainnet",
          { weight: 5, lane: "signed", priority: "background" },
          cycle * 15_000
        )
      }
    }
    reserveAsterRequest(
      "mainnet",
      { weight: 5, lane: "public", priority: "background" },
      0
    )
    expect(asterBudgetSnapshot("mainnet", 59_999)).toEqual({
      limit: 2_400,
      used: 127,
      publicWeight: 7,
      signedWeight: 120,
    })
  })
})
