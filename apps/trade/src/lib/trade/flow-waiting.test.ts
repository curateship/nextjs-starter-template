import { describe, expect, it } from "vitest"

import {
  describeFlowWait,
  flowHeadline,
  flowHoldFor,
  flowHoldJustBegan,
  flowWaitBacksOff,
  flowWaitCode,
  flowWaitIsProblem,
  flowWaitWords,
  type FlowHold,
} from "./flow-waiting"

/**
 * Sorting refusals into "it is working" and "somebody has to do something".
 *
 * The sorting is the whole point of the module, so that is what is guarded
 * hardest: a code landing in the wrong pile is the bug that brings back the
 * thing this replaced — a broken flow that looks patient.
 */

describe("which refusals are the strategy working", () => {
  it("counts waiting for a base as working, not as a problem", () => {
    expect(flowWaitIsProblem("SMART_LADDER_NO_BASE")).toBe(false)
    expect(flowWaitIsProblem("SMART_LADDER_UNDER_BASE")).toBe(false)
  })

  it("counts a bad rung size and a refused key as problems", () => {
    expect(flowWaitIsProblem("SMART_RUNG_TOO_SMALL:1")).toBe(true)
    expect(flowWaitIsProblem("LIVE_WALLET_KEY")).toBe(true)
  })

  it("treats a code nobody has thought about as a problem", () => {
    // Over-reporting is the safe failure. A code that silently counted as
    // "working" is exactly how a broken flow looks patient.
    expect(flowWaitIsProblem("SOMETHING_NEW")).toBe(true)
    expect(flowWaitWords("SOMETHING_NEW")).toContain("does not have words for")
  })

  it("reads a code that names which rung", () => {
    expect(flowWaitIsProblem("SMART_RUNG_TOO_SMALL:3")).toBe(true)
    expect(flowWaitWords("SMART_RUNG_TOO_SMALL:3")).toContain("too small")
  })
})

describe("what gets stored from an error", () => {
  it("keeps the app's own codes", () => {
    expect(flowWaitCode(new Error("LIVE_WALLET_KEY"))).toBe("LIVE_WALLET_KEY")
    expect(flowWaitCode(new Error("SMART_RUNG_TOO_SMALL:2"))).toBe(
      "SMART_RUNG_TOO_SMALL:2"
    )
  })

  it("throws away anything that is not plainly a code", () => {
    // This lands in the database and then on a screen. An exception's text can
    // carry whatever was in scope when it was thrown, and once it is stored it
    // is stored forever.
    expect(flowWaitCode(new Error("failed signing with 0xabc123def456"))).toBe(
      "FLOW_UNKNOWN"
    )
    expect(flowWaitCode("a string, not an error")).toBe("FLOW_UNKNOWN")
    expect(flowWaitCode(undefined)).toBe("FLOW_UNKNOWN")
  })
})

describe("the one line at the top of the chip", () => {
  const at = 1_700_000_000_000
  const wait = (coin: string, code: string) =>
    describeFlowWait(`hyperliquid:mainnet:${coin}`, { code, at })
  const line = (
    list: ReturnType<typeof wait>[],
    working = 0,
    hold: FlowHold | null = null
  ) => flowHeadline(list, working, hold, at)?.words ?? null

  it("names the coin when one thing needs a person", () => {
    const words = line([wait("ETH", "SMART_RUNG_TOO_SMALL:1")])
    expect(words).toContain("ETH")
    expect(words).toContain("rungs come out too small")
  })

  it("counts the coins when the same thing refuses many", () => {
    const words = line([
      wait("ETH", "SMART_RUNG_TOO_SMALL:1"),
      wait("BTC", "SMART_RUNG_TOO_SMALL:2"),
      wait("SOL", "SMART_LADDER_NO_BASE"),
    ])
    // The two that share a fault are the story; the one waiting is not.
    expect(words).toContain("2 coins")
    expect(words).toContain("rungs come out too small")
  })

  it("leads with the problem however many coins are quietly waiting", () => {
    const words = line([
      wait("ETH", "SMART_RUNG_TOO_SMALL:1"),
      wait("BTC", "SMART_LADDER_NO_BASE"),
      wait("SOL", "SMART_LADDER_NO_BASE"),
    ])
    expect(words).toContain("ETH")
    expect(words).not.toContain("waiting for the right price")
  })

  it("says when it will look again once it has stopped asking", () => {
    const hold = {
      code: "SMART_RUNG_TOO_SMALL:1",
      strikes: 4,
      until: at + 360_000,
    }
    const words = line(
      [
        wait("ETH", "SMART_RUNG_TOO_SMALL:1"),
        wait("BTC", "SMART_RUNG_TOO_SMALL:2"),
      ],
      0,
      hold
    )
    expect(words).toContain("2 coins")
    expect(words).toContain("Trying again in about 6 minutes")
  })

  it("says plainly that coins are waiting when nothing is wrong", () => {
    const words = line([
      wait("BTC", "SMART_LADDER_NO_BASE"),
      wait("SOL", "SMART_LADDER_NO_BASE"),
    ])
    expect(words).toBe("2 coins are waiting for the right price.")
  })

  it("says nothing when every coin already has a ladder", () => {
    expect(line([], 3)).toBeNull()
  })

  it("reads the coin off the market key", () => {
    expect(wait("ETH", "SMART_LADDER_NO_BASE").coin).toBe("ETH")
  })
})

describe("the exchange asking us to slow down", () => {
  it("reads a 429 as its own thing, not as words nobody has", () => {
    const html = "429 Too Many Requests - <html><title>429</title></html>"
    expect(flowWaitCode(new Error(html))).toBe("EXCHANGE_BUSY")
    expect(flowWaitCode(new Error("Rate limit exceeded"))).toBe("EXCHANGE_BUSY")
  })

  it("is not somebody's fault, so it is not a problem to fix", () => {
    // Calling it a problem sends somebody looking for a broken setting that is
    // not there. It clears on its own.
    expect(flowWaitIsProblem("EXCHANGE_BUSY")).toBe(false)
  })

  it("still stops the flow asking, which waiting for a base does not", () => {
    // The two questions are separate: a rate limit is nobody's mistake AND the
    // strongest reason to stop, because asking is what caused it.
    expect(flowWaitBacksOff("EXCHANGE_BUSY")).toBe(true)
    expect(flowWaitBacksOff("SMART_LADDER_NO_BASE")).toBe(false)
    expect(flowWaitBacksOff("LIVE_WALLET_KEY")).toBe(true)
  })

  it("waits longer than a fault does, and goes further out", () => {
    expect(flowHoldFor(3, "EXCHANGE_BUSY")).toBeGreaterThan(flowHoldFor(3))
    expect(flowHoldFor(99, "EXCHANGE_BUSY")).toBe(30 * 60_000)
    expect(flowHoldFor(99)).toBe(15 * 60_000)
  })

  it("leads the chip even though it is not a fault", () => {
    const at = 1_700_000_000_000
    const list = [
      describeFlowWait("hyperliquid:testnet:ETH", {
        code: "EXCHANGE_BUSY",
        at,
      }),
    ]
    const hold = { code: "EXCHANGE_BUSY", strikes: 3, until: at + 240_000 }
    const head = flowHeadline(list, 0, hold, at)
    expect(head?.words).toContain("slow down")
    expect(head?.words).toContain("4 minutes")
    expect(head?.problem).toBe(false)
  })
})

describe("the exchange refusing in its own words", () => {
  it("names not enough margin, which arrives as the exchange's sentence", () => {
    const code = flowWaitCode(
      new Error(
        "LIVE_EXCHANGE:order 0: Insufficient margin to place order. asset=2470001"
      )
    )
    expect(code).toBe("EXCHANGE_NO_MARGIN")
    // Since Hyperliquid unified its account this really does mean the money
    // is short — the old words blamed a wall between markets that no longer
    // exists.
    expect(flowWaitWords(code)).toContain("not enough money free")
    expect(flowWaitIsProblem(code)).toBe(true)
  })

  it("still says so plainly when it has no words for a refusal", () => {
    expect(flowWaitCode(new Error("LIVE_EXCHANGE:something new"))).toBe(
      "FLOW_UNKNOWN"
    )
  })
})

describe("the one moment a hold's notice goes out", () => {
  const held = (code: string, strikes: number) => ({
    code,
    strikes,
    until: strikes >= 3 ? 1_000_000 : 0,
  })

  it("fires exactly when the third identical refusal begins the hold", () => {
    expect(
      flowHoldJustBegan(held("LIVE_MARKET", 2), held("LIVE_MARKET", 3))
    ).toBe(true)
    expect(flowHoldJustBegan(null, held("LIVE_MARKET", 3))).toBe(true)
  })

  it("stays quiet while the strikes keep rising on the same answer", () => {
    expect(
      flowHoldJustBegan(held("LIVE_MARKET", 3), held("LIVE_MARKET", 4))
    ).toBe(false)
    expect(
      flowHoldJustBegan(held("LIVE_MARKET", 7), held("LIVE_MARKET", 8))
    ).toBe(false)
  })

  it("stays quiet before three, and after the hold clears", () => {
    expect(flowHoldJustBegan(null, held("LIVE_MARKET", 1))).toBe(false)
    expect(
      flowHoldJustBegan(held("LIVE_MARKET", 1), held("LIVE_MARKET", 2))
    ).toBe(false)
    expect(flowHoldJustBegan(held("LIVE_MARKET", 3), null)).toBe(false)
  })

  it("speaks again when a different problem starts its own hold", () => {
    expect(
      flowHoldJustBegan(held("LIVE_MARKET", 5), held("LIVE_WALLET_KEY", 3))
    ).toBe(true)
  })

  it("reads the code without the rung number some of them carry", () => {
    expect(
      flowHoldJustBegan(
        held("SMART_RUNG_TOO_SMALL:3", 3),
        held("SMART_RUNG_TOO_SMALL:5", 4)
      )
    ).toBe(false)
  })
})
