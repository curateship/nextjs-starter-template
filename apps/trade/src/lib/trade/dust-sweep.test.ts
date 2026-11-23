import { describe, expect, it } from "vitest"

import {
  judgeLeftover,
  leftoverCoins,
  sweepDollarCoin,
} from "@/lib/trade/dust-sweep"

const coin = (marketId: string, coins: number, price: number | null) => ({
  marketKey: `solana:mainnet:${marketId}`,
  marketId,
  coins,
  price,
})

describe("which holdings are leftovers", () => {
  it("counts coins worth under the limit, smallest first, and keeps the fee coin", () => {
    const { measured, unpriced } = leftoverCoins(
      [
        coin("JUP", 20, 0.56), // $11.20
        coin("BONK", 100_000, 0.000031), // $3.10
        coin("WIF", 4, 1.85), // $7.40
        coin("BIG", 10, 3), // $30, over the $25 limit
        coin("SOL", 0.01, 150), // $1.50, but SOL pays the fees
      ],
      25,
      new Set(["SOL"])
    )
    expect(measured.map((one) => one.marketId)).toEqual(["BONK", "WIF", "JUP"])
    expect(measured.map((one) => one.valueUsd)).toEqual([
      expect.closeTo(3.1, 9),
      expect.closeTo(7.4, 9),
      expect.closeTo(11.2, 9),
    ])
    expect(unpriced).toEqual([])
  })

  it("lists a coin with no price as skipped instead of guessing its worth", () => {
    const { measured, unpriced } = leftoverCoins(
      [coin("AIRDROP", 5_000, null)],
      25,
      new Set()
    )
    expect(measured).toEqual([])
    expect(unpriced).toMatchObject([
      { marketKey: "solana:mainnet:AIRDROP", verdict: "skip", valueUsd: null },
    ])
  })

  it("treats a coin worth exactly the limit as not a leftover", () => {
    expect(leftoverCoins([coin("X", 1, 25)], 25, new Set()).measured).toEqual([])
  })
})

describe("the fee rule", () => {
  it("swaps a $3.10 coin that costs about $0.02", () => {
    const judged = judgeLeftover({ valueUsd: 3.1, backUsd: 3.09, networkFeeUsd: 0.01 })
    expect(judged.verdict).toBe("sweep")
    expect(judged.feeUsd).toBeCloseTo(0.02, 9)
  })

  it("skips a coin whose fee is more than half of its worth", () => {
    // Worth $0.30, $0.28 back, $0.20 for the chain: $0.22 is over $0.15.
    const judged = judgeLeftover({ valueUsd: 0.3, backUsd: 0.28, networkFeeUsd: 0.2 })
    expect(judged.verdict).toBe("skip")
    expect(judged.reason).toBe(
      "The fee, about $0.22, is more than half of the $0.30 it is worth."
    )
  })

  it("swaps a coin whose fee is exactly half of its worth", () => {
    expect(
      judgeLeftover({ valueUsd: 1, backUsd: 1, networkFeeUsd: 0.5 }).verdict
    ).toBe("sweep")
  })

  it("never counts a quote above the last price as a negative fee", () => {
    const judged = judgeLeftover({ valueUsd: 2, backUsd: 2.5, networkFeeUsd: 0.1 })
    expect(judged.feeUsd).toBeCloseTo(0.1, 9)
  })
})

describe("which wallets can sweep", () => {
  const wallet = (protocol: "solana" | "bnb" | "hyperliquid", kind = "live") =>
    ({ protocol, kind, network: "mainnet" }) as const

  it("sweeps Solana into USDC and BNB Chain into USDT, real wallets only", () => {
    expect(sweepDollarCoin(wallet("solana"))).toBe("USDC")
    expect(sweepDollarCoin(wallet("bnb"))).toBe("USDT")
    expect(sweepDollarCoin(wallet("hyperliquid"))).toBeNull()
    expect(sweepDollarCoin(wallet("solana", "paper"))).toBeNull()
  })
})
