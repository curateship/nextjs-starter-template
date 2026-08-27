import { afterEach, describe, expect, it } from "vitest"

import {
  clearLighterBudgets,
  countLighterSocketSend,
  LIGHTER_REQUESTS_PER_MINUTE,
  ceilingFor,
  lighterRequestsPerProcess,
  lighterBudgetSnapshot,
  reserveLighterRequest,
} from "@/server/protocols/lighter/budget"

/**
 * Read from the module rather than typed in, so the numbers below cannot
 * quietly disagree with the cap the code actually enforces.
 */
const CAP = LIGHTER_REQUESTS_PER_MINUTE
const SHARE = lighterRequestsPerProcess()
const BACKGROUND_CEILING = ceilingFor("background")

afterEach(() => {
  clearLighterBudgets()
})

describe("what Lighter allows", () => {
  it("is the sixty-a-minute Standard cap, split between the two programs", () => {
    // Premium raises this to 24,000 a minute, but only by staking LIT.
    expect(CAP).toBe(60)
    // The website and the engine are separate containers with separate
    // memory, and Lighter counts them together. Each counting the full sixty
    // meant both stayed under a limit that did not exist, and Lighter
    // answered by dropping the socket every thirteen seconds.
    // The website's share. The engine takes the other twenty — it reads
    // Lighter only for wallets running ladders, in bursts, while this side
    // serves somebody watching a screen. Splitting evenly halved the
    // website's ceiling and refused charts, which is what this replaced.
    expect(SHARE).toBe(40)
    expect(BACKGROUND_CEILING).toBe(24)
    // Both programs at their own ceiling must still fit inside the real cap.
    expect(SHARE + 20).toBeLessThanOrEqual(CAP)
  })

  it("gives the engine a smaller share, and never breaches the cap together", () => {
    const scope = globalThis as { __tradeEngine?: boolean }
    try {
      scope.__tradeEngine = true
      expect(lighterRequestsPerProcess()).toBe(20)
      const engineCeilings = ceilingFor("order")
      scope.__tradeEngine = undefined
      // Whatever the split, the two together must fit inside Lighter's one
      // allowance — that is the whole reason the split exists.
      expect(engineCeilings + ceilingFor("order")).toBeLessThanOrEqual(CAP)
    } finally {
      scope.__tradeEngine = undefined
    }
  })

  it("keeps room for a chart somebody is waiting on", () => {
    /**
     * The idle reads ask FIRST on every poll and the chart asks last, so one
     * shared ceiling meant the chart was always the thing refused — the
     * person saw "the allowance is spent" about the one request they were
     * actually waiting for. This is what stops that.
     */
    expect(ceilingFor("watched")).toBeGreaterThan(ceilingFor("background"))
    expect(ceilingFor("order")).toBeGreaterThan(ceilingFor("watched"))
    // Spend every background request, then the chart still gets through.
    for (let sent = 0; sent < ceilingFor("background"); sent += 1) {
      reserveLighterRequest("mainnet", { weight: 300, priority: "background" }, 0)
    }
    expect(() =>
      reserveLighterRequest("mainnet", { weight: 300, priority: "background" }, 0)
    ).toThrow("EXCHANGE_BUSY")
    expect(() =>
      reserveLighterRequest("mainnet", { weight: 60, priority: "watched" }, 0)
    ).not.toThrow()
  })
})

describe("Lighter's request budget", () => {
  it("stops background reads at four fifths of the sixty-a-minute cap", () => {
    for (let sent = 0; sent < BACKGROUND_CEILING; sent += 1) {
      reserveLighterRequest("mainnet", { weight: 300, priority: "background" }, 0)
    }
    expect(() =>
      reserveLighterRequest(
        "mainnet",
        { weight: 300, priority: "background" },
        0
      )
    ).toThrow("EXCHANGE_BUSY")
    // What is left of THIS PROCESS'S share stays free for order work.
    for (let sent = 0; sent < SHARE - BACKGROUND_CEILING; sent += 1) {
      reserveLighterRequest("mainnet", { weight: 6, priority: "order" }, 0)
    }
    expect(() =>
      reserveLighterRequest("mainnet", { weight: 6, priority: "order" }, 0)
    ).toThrow("EXCHANGE_BUSY")
  })

  it("counts socket frames in the same rolling minute as REST calls", () => {
    for (let sent = 0; sent < BACKGROUND_CEILING - 1; sent += 1) {
      countLighterSocketSend("mainnet", 0)
    }
    reserveLighterRequest("mainnet", { weight: 300, priority: "background" }, 0)
    expect(() =>
      reserveLighterRequest(
        "mainnet",
        { weight: 300, priority: "background" },
        0
      )
    ).toThrow("EXCHANGE_BUSY")
    const snapshot = lighterBudgetSnapshot("mainnet", 0)
    expect(snapshot.requests).toBe(BACKGROUND_CEILING)
    expect(snapshot.socketSends).toBe(BACKGROUND_CEILING - 1)
    expect(snapshot.restRequests).toBe(1)
  })

  it("releases a spent request at the rolling minute boundary", () => {
    for (let sent = 0; sent < BACKGROUND_CEILING; sent += 1) {
      reserveLighterRequest("mainnet", { weight: 300, priority: "background" }, 0)
    }
    expect(() =>
      reserveLighterRequest(
        "mainnet",
        { weight: 300, priority: "background" },
        59_999
      )
    ).toThrow("EXCHANGE_BUSY")
    reserveLighterRequest(
      "mainnet",
      { weight: 300, priority: "background" },
      60_001
    )
  })

  it("keeps the two networks apart and refuses a nonsense weight", () => {
    reserveLighterRequest("mainnet", { weight: 300, priority: "background" }, 0)
    expect(lighterBudgetSnapshot("testnet", 0).requests).toBe(0)
    expect(() =>
      reserveLighterRequest("mainnet", { weight: 0, priority: "background" }, 0)
    ).toThrow("LIGHTER_REQUEST_WEIGHT_INVALID")
  })
})
