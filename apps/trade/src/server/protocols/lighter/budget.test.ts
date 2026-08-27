import { afterEach, describe, expect, it } from "vitest"

import {
  clearLighterBudgets,
  countLighterSocketSend,
  LIGHTER_REQUESTS_PER_MINUTE,
  LIGHTER_REQUESTS_PER_PROCESS,
  lighterBudgetSnapshot,
  reserveLighterRequest,
} from "@/server/protocols/lighter/budget"

/**
 * Read from the module rather than typed in, so the numbers below cannot
 * quietly disagree with the cap the code actually enforces.
 */
const CAP = LIGHTER_REQUESTS_PER_MINUTE
const SHARE = LIGHTER_REQUESTS_PER_PROCESS
const BACKGROUND_CEILING = Math.floor((SHARE * 4) / 5)

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
    expect(SHARE).toBe(30)
    expect(BACKGROUND_CEILING).toBe(24)
    // Two processes at their own ceiling must still fit inside the real cap.
    expect(SHARE * 2).toBeLessThanOrEqual(CAP)
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
    // The last fifth of THIS PROCESS'S share stays free for order work.
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
