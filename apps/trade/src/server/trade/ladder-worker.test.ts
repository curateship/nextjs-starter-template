import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

/**
 * The rate the server works ladders at, and the one promise that matters: two
 * turns of the shell's loop can never run at the same time.
 */

const walletRows = vi.hoisted(() => ({ value: [] as Array<{ userId: string; walletId: string }> }))
const settled = vi.hoisted(() => ({ count: 0 }))
const control = vi.hoisted(() => ({ value: { enabled: true, paused: false } }))

vi.mock("@/server/db", () => ({
  db: {
    selectDistinct: () => ({
      from: () => ({ where: async () => walletRows.value }),
    }),
  },
}))

vi.mock("@/server/trade/wallets", () => ({
  findWallet: async (userId: string, id: string) => ({
    id,
    label: id,
    kind: "paper" as const,
    status: "active" as const,
    protocol: "hyperliquid" as const,
    network: "mainnet" as const,
    startingBalance: 1_000,
    address: null,
    hasKey: false,
    keyValidUntil: null,
    userId,
  }),
}))

vi.mock("@/server/trade/workers", () => ({
  workerControl: async () => control.value,
}))

vi.mock("@/server/trade/live-marks", () => ({
  pushedMarks: () => null,
}))

vi.mock("@/server/trade/paper", () => ({
  exposedMarketKeys: async () => [],
  settleWallet: async () => {
    // A pass slow enough that the timer would fire again mid-flight.
    await new Promise((done) => setTimeout(done, 1))
    settled.count += 1
  },
}))

vi.mock("@/server/trade/live-smart-orders", () => ({
  reconcileLiveLadders: async () => {},
}))

const { advanceWorkingLadders } = await import("@/server/trade/ladder-worker")

describe("the server's ladder job", () => {
  beforeEach(() => {
    settled.count = 0
    control.value = { enabled: true, paused: false }
    walletRows.value = [{ userId: "u1", walletId: "w1" }]
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("works every wallet that has a ladder going", async () => {
    walletRows.value = [
      { userId: "u1", walletId: "w1" },
      { userId: "u2", walletId: "w2" },
    ]
    await advanceWorkingLadders()
    expect(settled.count).toBe(2)
  })

  it("leaves a wallet with nothing running alone", async () => {
    walletRows.value = []
    await advanceWorkingLadders()
    expect(settled.count).toBe(0)
  })

  it("never runs two passes at once", async () => {
    // The four-second timer fires again while a slow pass is still going. A
    // second pass would double every query without anything happening sooner.
    const first = advanceWorkingLadders()
    const second = advanceWorkingLadders()
    await Promise.all([first, second])

    expect(settled.count).toBe(1)
  })

  it("does nothing at all while it is paused", async () => {
    control.value = { enabled: true, paused: false }
    await advanceWorkingLadders()
    expect(settled.count).toBe(1)

    // Pausing is meant to stop trading dead while somebody looks at something,
    // and it has to take effect on the very next pass rather than at a restart.
    control.value = { enabled: true, paused: true }
    await advanceWorkingLadders()
    expect(settled.count).toBe(1)
  })

  it("does nothing at all while it is switched off", async () => {
    control.value = { enabled: false, paused: false }
    await advanceWorkingLadders()
    expect(settled.count).toBe(0)
  })
})
