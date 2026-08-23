import { describe, expect, it } from "vitest"

import {
  capForPickedWallet,
  keepGoodSummaries,
  MISSES_BEFORE_UNREACHABLE,
  cleanAgentKey,
  describeAgentKeyProblem,
  describeKeyRefusal,
} from "@/lib/trade/wallets"

describe("cleaning a pasted key", () => {
  const KEY = "ab".repeat(32)

  it("strips spaces, newlines and invisible characters", () => {
    expect(cleanAgentKey(` 0x${KEY}\n`)).toBe(`0x${KEY}`)
    expect(cleanAgentKey(`0x\u200B${KEY}\uFEFF`)).toBe(`0x${KEY}`)
  })

  it("says exactly what is wrong, without echoing the key", () => {
    expect(describeAgentKeyProblem(`0x${KEY}`)).toBeNull()
    expect(describeAgentKeyProblem(`0x\u200B${KEY}`)).toBeNull()
    expect(describeAgentKeyProblem(`0x0x${KEY}`)).toContain("0x twice")
    expect(describeAgentKeyProblem(`0x${"ab".repeat(20)}`)).toContain("address")
    expect(describeAgentKeyProblem(`0x${"ab".repeat(31)}zz`)).toContain('("z")')
    expect(describeAgentKeyProblem(`0x${"ab".repeat(30)}`)).toContain(
      "60 characters"
    )
  })
})

import {
  isAgentKey,
  shortenAddress,
  summarizeWallet,
  venueLabel,
  type WalletAccountSummary,
} from "@/lib/trade/wallets"

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"

describe("the five account rows", () => {
  it("splits the journey into settled and still-open money", () => {
    const summary = summarizeWallet(
      { id: "w1" },
      { equity: 10_500, free: 9_000, inTrades: 1_500, openProfit: 300 },
      { settled: 200, unpricedFills: 0 }
    )
    if (summary.state !== "ok") throw new Error("expected figures")
    expect(summary.madeOrLost).toBe(500)
    expect(summary.settled).toBe(200)
  })

  it("always adds back up: settled plus open profit is the whole journey", () => {
    const cases = [
      { equity: 9_400, openProfit: -250 },
      { equity: 10_000, openProfit: 0 },
      { equity: 12_345.67, openProfit: 890.12 },
    ]
    for (const figures of cases) {
      const summary = summarizeWallet(
        { id: "w1" },
        { ...figures, free: 0, inTrades: 0 },
        { settled: 200, unpricedFills: 0 }
      )
      if (summary.state !== "ok") throw new Error("expected figures")
      expect(summary.settled + summary.openProfit).toBeCloseTo(
        summary.madeOrLost,
        10
      )
    }
  })
})

describe("what counts as a key", () => {
  it("accepts a key with or without its 0x", () => {
    const key = "a".repeat(64)
    expect(isAgentKey(key)).toBe(true)
    expect(isAgentKey(`0x${key}`)).toBe(true)
    expect(isAgentKey(key.slice(0, -1))).toBe(false)
    expect(isAgentKey(`${key}zz`)).toBe(false)
  })
})

describe("how wallets are labelled", () => {
  it("shows enough of each end of an address to recognise it", () => {
    expect(shortenAddress(ADDRESS)).toBe("0x1234…5678")
    expect(shortenAddress("0xshort")).toBe("0xshort")
  })

  it("names the venue, and says so out loud on testnet", () => {
    expect(venueLabel("hyperliquid", "mainnet")).toBe("Hyperliquid")
    expect(venueLabel("hyperliquid", "testnet")).toBe("Hyperliquid Testnet")
  })
})

describe("why a trading key was not approved", () => {
  it("hands back whatever the exchange wrote, whichever exchange it was", () => {
    // Two exchanges, two completely different explanations, and this reader
    // knows neither of them — which is the point.
    expect(
      describeKeyRefusal(
        "KEY_NOT_APPROVED:The key you pasted is for 0x1111…1111. Hyperliquid lists 0x2222…2222 as approved, so it is not one of those."
      )
    ).toContain("0x2222…2222")
    expect(
      describeKeyRefusal("KEY_NOT_APPROVED:KuCoin would not accept it.")
    ).toBe("KuCoin would not accept it.")
  })

  it("keeps a reason that runs to more than one line", () => {
    expect(describeKeyRefusal("KEY_NOT_APPROVED:one.\ntwo.")).toBe(
      "one.\ntwo."
    )
  })

  it("refuses to lift words out of the middle of some other error", () => {
    // Only an exchange's own refusal is shown to a person. A longer message
    // that merely happens to contain those letters is not one.
    expect(
      describeKeyRefusal(
        "Request failed at https://internal/x?token=abc KEY_NOT_APPROVED: stack trace follows"
      )
    ).toBeNull()
  })

  it("is nothing for a refusal the exchange did not explain", () => {
    expect(describeKeyRefusal("KEY_EXPIRED")).toBeNull()
    expect(describeKeyRefusal("KEY_NOT_APPROVED")).toBeNull()
    expect(describeKeyRefusal("KEY_NOT_APPROVED:   ")).toBeNull()
  })
})

describe("the cap a freshly picked wallet starts at", () => {
  const readable: WalletAccountSummary = {
    walletId: "w1",
    state: "ok",
    equity: 1_200,
    free: 1_000,
    inTrades: 200,
    openProfit: 0,
    madeOrLost: 200,
    settled: 200,
    unpricedFills: 0,
  }

  it("is what the wallet has free, not the backtest's pot", () => {
    // A cap of $30,000 over a wallet holding $1,000 buys exactly what $1,000
    // buys. The bigger number was never anything but a number on screen.
    expect(capForPickedWallet(readable, 30_000)).toBe(1_000)
  })

  it("falls back when the exchange could not be reached", () => {
    expect(
      capForPickedWallet({ walletId: "w1", state: "unreachable" }, 30_000)
    ).toBe(30_000)
  })

  it("falls back when the figures have not arrived", () => {
    expect(capForPickedWallet(undefined, 30_000)).toBe(30_000)
  })

  it("falls back on an empty account rather than writing a cap of nothing", () => {
    // The box will not take a zero, so an empty wallet has to leave the old
    // number where it was.
    expect(capForPickedWallet({ ...readable, free: 0 }, 30_000)).toBe(30_000)
  })
})

describe("holding a wallet's figures through a missed read", () => {
  const GOOD = {
    walletId: "w1",
    state: "ok",
    equity: 1_000,
    free: 400,
    inTrades: 600,
    openProfit: 25,
    madeOrLost: 100,
    settled: 75,
    unpricedFills: 0,
  } as const
  const MISSED = { walletId: "w1", state: "unreachable" } as const

  it("keeps the last good figures through a hiccup, and marks them old", () => {
    const first = keepGoodSummaries(new Map(), [GOOD], new Map())
    expect(first.summaries.get("w1")).toMatchObject({ state: "ok", equity: 1_000 })
    expect(first.summaries.get("w1")).not.toHaveProperty("stale", true)

    const missed = keepGoodSummaries(first.summaries, [MISSED], first.misses)
    // Still the figures that landed, and honest about being a moment behind.
    expect(missed.summaries.get("w1")).toMatchObject({
      state: "ok",
      equity: 1_000,
      stale: true,
    })
    expect(missed.misses.get("w1")).toBe(1)
  })

  it("says it cannot reach the wallet once the misses pile up", () => {
    let held = keepGoodSummaries(new Map(), [GOOD], new Map())
    for (let read = 0; read < MISSES_BEFORE_UNREACHABLE; read += 1) {
      held = keepGoodSummaries(held.summaries, [MISSED], held.misses)
    }
    expect(held.summaries.get("w1")).toEqual(MISSED)
  })

  it("forgets the misses the moment a read lands", () => {
    let held = keepGoodSummaries(new Map(), [GOOD], new Map())
    held = keepGoodSummaries(held.summaries, [MISSED], held.misses)
    held = keepGoodSummaries(held.summaries, [GOOD], held.misses)

    expect(held.misses.has("w1")).toBe(false)
    // Fresh again — nothing left saying these figures are old.
    expect(held.summaries.get("w1")).not.toHaveProperty("stale", true)
  })

  it("does not count a switched-off wallet as a missed read", () => {
    const off = { walletId: "w1", state: "inactive" } as const
    let held = keepGoodSummaries(new Map(), [GOOD], new Map())
    held = keepGoodSummaries(held.summaries, [off], held.misses)

    // Switched off is not a failure, so nothing is counted against it and the
    // card never ends up saying the exchange could not be reached.
    expect(held.summaries.get("w1")).toEqual(off)
    expect(held.misses.has("w1")).toBe(false)
  })

  it("never invents figures for a wallet that has never answered", () => {
    const cold = keepGoodSummaries(new Map(), [MISSED], new Map())
    expect(cold.summaries.get("w1")).toEqual(MISSED)
  })

  it("shows a position-mode refusal immediately instead of calling it a hiccup", () => {
    const refusal = {
      walletId: "w1",
      state: "unreachable",
      reason: "Change Position Mode to One-way Mode on Aster, then refresh.",
    } as const
    const held = keepGoodSummaries(
      new Map([["w1", GOOD]]),
      [refusal],
      new Map()
    )

    expect(held.summaries.get("w1")).toEqual(refusal)
    expect(held.misses.has("w1")).toBe(false)
  })
})
