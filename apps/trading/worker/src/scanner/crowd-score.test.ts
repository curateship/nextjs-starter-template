import { describe, expect, it } from "vitest"

import { crowdScore, type CrowdInput } from "./crowd-score"

function input(overrides: Partial<CrowdInput>): CrowdInput {
  return {
    walletCount: 1,
    totalNotional: 50_000,
    avgQuality: null,
    windowMs: 30 * 60_000,
    spanMs: 30 * 60_000,
    directionShare: 0.5,
    ...overrides,
  }
}

describe("crowdScore", () => {
  it("scores a lone small trade low", () => {
    expect(crowdScore(input({}))).toBeLessThan(25)
  })

  it("scores a tight high-quality cluster high", () => {
    const score = crowdScore(
      input({
        walletCount: 8,
        totalNotional: 5_000_000,
        avgQuality: 80,
        spanMs: 5 * 60_000,
        directionShare: 0.9,
      })
    )
    expect(score).toBeGreaterThan(75)
  })

  it("rewards more wallets", () => {
    const few = crowdScore(input({ walletCount: 2 }))
    const many = crowdScore(input({ walletCount: 6 }))
    expect(many).toBeGreaterThan(few)
  })

  it("rewards time compression", () => {
    const slow = crowdScore(input({ walletCount: 4, spanMs: 30 * 60_000 }))
    const fast = crowdScore(input({ walletCount: 4, spanMs: 60_000 }))
    expect(fast).toBeGreaterThan(slow)
  })

  it("rewards direction agreement", () => {
    const split = crowdScore(input({ walletCount: 4, directionShare: 0.5 }))
    const oneWay = crowdScore(input({ walletCount: 4, directionShare: 1 }))
    expect(oneWay).toBeGreaterThan(split)
  })

  it("stays within 0-100", () => {
    const max = crowdScore(
      input({
        walletCount: 100,
        totalNotional: 1e9,
        avgQuality: 100,
        spanMs: 0,
        directionShare: 1,
      })
    )
    expect(max).toBeLessThanOrEqual(100)
    expect(crowdScore(input({ walletCount: 0, totalNotional: 0 }))).toBeGreaterThanOrEqual(0)
  })
})
