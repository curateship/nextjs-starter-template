import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

/**
 * The rate the server works ladders at, and the one promise that matters: two
 * turns of the shell's loop can never run at the same time.
 */

const walletRows = vi.hoisted(() => ({
  value: [] as Array<{ userId: string; walletId: string }>,
}))
const settled = vi.hoisted(() => ({
  count: 0,
  /** Wallets whose turn throws, so a failing wallet can be staged. */
  fail: new Set<string>(),
  /** Which wallets have finished a turn, in the order they finished. */
  done: [] as string[],
  /** How long each wallet's turn takes, so a slow one can be staged. */
  delays: new Map<string, number>(),
}))
const control = vi.hoisted(() => ({
  value: { enabled: true, paused: false } as {
    enabled: boolean
    paused: boolean
    restartRequestedAt?: Date | null
    flowScanRequestedAt?: Date | null
  },
  cleared: 0,
  scanCleared: 0,
}))
const flowWork = vi.hoisted(() => ({ scans: 0, stops: 0, removals: 0 }))

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
  workerControl: async () => ({
    restartRequestedAt: null,
    flowScanRequestedAt: null,
    ...control.value,
  }),
  clearWorkerRestart: async () => {
    control.cleared += 1
  },
  clearFlowScanRequest: async () => {
    control.scanCleared += 1
    control.value.flowScanRequestedAt = null
  },
}))

vi.mock("@/server/trade/live-marks", () => ({
  // A line carrying nothing: every market comes back on the missing list, so
  // the caller asks the ordinary way.
  pushedMarks: (keys: readonly string[]) => ({
    marks: new Map<string, number>(),
    missing: [...keys],
  }),
}))

vi.mock("@/server/trade/paper", () => ({
  exposedMarketKeys: async () => [],
  settleWallet: async (_userId: string, wallet: { id: string }) => {
    // A pass slow enough that the timer would fire again mid-flight.
    await new Promise((done) =>
      setTimeout(done, settled.delays.get(wallet.id) ?? 1)
    )
    if (settled.fail.has(wallet.id)) throw new Error("this wallet is broken")
    settled.count += 1
    settled.done.push(wallet.id)
  },
}))

vi.mock("@/server/trade/live-smart-orders", () => ({
  reconcileLiveLadders: async () => {},
}))

// Not mocked before, so every pass loaded the real module and its whole
// dependency graph. On its own that was slow but survivable; run beside another
// suite it took longer than the test's own timeout, and the wallet left mid-flight
// stayed marked busy, so every test after it settled nothing.
vi.mock("@/server/trade/flow-run", () => ({
  advanceRunningFlows: async () => {
    flowWork.scans += 1
  },
  advanceStoppingFlows: async () => {
    flowWork.stops += 1
  },
  advanceRemovedFlowLadders: async () => {
    flowWork.removals += 1
  },
}))

const { advanceWorkingLadders, lastPass, resetLadderPassState } =
  await import("@/server/trade/ladder-worker")

describe("the server's ladder job", () => {
  beforeEach(() => {
    resetLadderPassState()
    settled.count = 0
    settled.done = []
    settled.delays = new Map()
    settled.fail = new Set()
    flowWork.scans = 0
    flowWork.stops = 0
    flowWork.removals = 0
    control.scanCleared = 0
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

  it("works stops every pass without speeding up the coin hunt", async () => {
    await advanceWorkingLadders()
    await advanceWorkingLadders()

    expect(flowWork.stops).toBe(2)
    expect(flowWork.removals).toBe(2)
    expect(flowWork.scans).toBe(1)
  })

  it("runs the next coin hunt when a folder asks for one", async () => {
    await advanceWorkingLadders()
    await advanceWorkingLadders()
    expect(flowWork.scans).toBe(1)

    control.value.flowScanRequestedAt = new Date()
    await advanceWorkingLadders()

    expect(flowWork.scans).toBe(2)
    expect(control.scanCleared).toBe(1)
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

  it("leaves wallets alone while paused but still finishes explicit stops", async () => {
    control.value = { enabled: true, paused: false }
    await advanceWorkingLadders()
    expect(settled.count).toBe(1)

    // Pausing is meant to stop trading dead while somebody looks at something,
    // and it has to take effect on the very next pass rather than at a restart.
    control.value = { enabled: true, paused: true }
    await advanceWorkingLadders()
    expect(settled.count).toBe(1)
    expect(flowWork.stops).toBe(2)
    expect(flowWork.removals).toBe(2)
    expect(flowWork.scans).toBe(1)
  })

  it("honours a restart request between passes, and clears it", async () => {
    control.cleared = 0
    const asked: string[] = []
    globalThis.__tradeLadderRestart = (reason: string) => asked.push(reason)
    try {
      control.value = {
        enabled: true,
        paused: false,
        restartRequestedAt: new Date(),
      }
      await advanceWorkingLadders()
      // Nothing was worked: the pass ends before any wallet is touched, so
      // the exit always lands between passes, never inside one.
      expect(settled.count).toBe(0)
      // Cleared BEFORE the handler runs, so the replacement boots clean.
      expect(control.cleared).toBe(1)
      expect(asked).toEqual(["restart requested"])
      expect(lastPass.activity).toBe("Restarting")
    } finally {
      globalThis.__tradeLadderRestart = undefined
    }
  })

  it("clears a restart request and keeps running when nothing registered an exit", async () => {
    control.cleared = 0
    control.value = {
      enabled: true,
      paused: false,
      restartRequestedAt: new Date(),
    }
    await advanceWorkingLadders()
    expect(control.cleared).toBe(1)
    expect(settled.count).toBe(0)

    // The dev server survives: the next pass simply works as normal.
    control.value = { enabled: true, paused: false }
    await advanceWorkingLadders()
    expect(settled.count).toBe(1)
  })

  it("leaves wallets alone while switched off but still finishes explicit stops", async () => {
    control.value = { enabled: false, paused: false }
    await advanceWorkingLadders()
    expect(settled.count).toBe(0)
    expect(flowWork.stops).toBe(1)
    expect(flowWork.removals).toBe(1)
    expect(flowWork.scans).toBe(0)
  })
})

/**
 * One wallet must never set another wallet's clock.
 *
 * The whole pass used to wait for every wallet, so the slowest one decided how
 * often ALL of them were looked at. Measured on 22 Aug 2026: a KuCoin wallet
 * on 454 markets took about fourteen seconds, because KuCoin prices one market
 * at a time. A Hyperliquid wallet next to it needed 0.3 seconds and was still
 * only looked at every fourteen, which is how a grid level was crossed and
 * missed while CHIP fell 22% in ninety seconds.
 */
describe("a slow wallet", () => {
  beforeEach(() => {
    resetLadderPassState()
    settled.count = 0
    settled.done = []
    settled.delays = new Map()
    settled.fail = new Set()
    control.value = { enabled: true, paused: false }
  })

  it("does not make a quick wallet wait for it", async () => {
    walletRows.value = [
      { userId: "u1", walletId: "slow" },
      { userId: "u1", walletId: "quick" },
    ]
    settled.delays.set("slow", 60)
    settled.delays.set("quick", 1)

    await advanceWorkingLadders()

    // The quick one finished first even though it was second in the list. In a
    // queue it could only ever have finished after the slow one.
    expect(settled.done).toEqual(["quick", "slow"])
  })

  it("is stepped over by the next pass rather than blocking it", async () => {
    walletRows.value = [
      { userId: "u1", walletId: "slow" },
      { userId: "u1", walletId: "quick" },
    ]
    settled.delays.set("slow", 60)
    settled.delays.set("quick", 1)

    const first = advanceWorkingLadders()
    // Long enough for the guard on the short stretch to be let go and for the
    // quick wallet to have finished, while the slow one is still going.
    await new Promise((done) => setTimeout(done, 20))
    await advanceWorkingLadders()

    // The quick wallet got a second turn while the slow one was still on its
    // first. The slow one was not started twice.
    expect(settled.done.filter((id) => id === "quick")).toHaveLength(2)
    expect(settled.done.filter((id) => id === "slow")).toHaveLength(0)

    await first
    expect(settled.done.filter((id) => id === "slow")).toHaveLength(1)
  })
})

/**
 * What the Workers screen is told when a wallet is failing.
 *
 * The error used to be wiped at the top of every pass. That was harmless while
 * a pass took half a minute. With a pass every second it meant a wallet failing
 * on every single pass showed its error for under a second at a time, and the
 * screen called the engine healthy. It has done exactly that before, for twenty
 * minutes, on 20 Aug 2026.
 */
describe("a wallet that keeps failing", () => {
  beforeEach(() => {
    resetLadderPassState()
    settled.count = 0
    settled.done = []
    settled.delays = new Map()
    settled.fail = new Set()
    control.value = { enabled: true, paused: false }
    lastPass.error = null
  })

  it("keeps saying so rather than being wiped by the next pass", async () => {
    walletRows.value = [{ userId: "u1", walletId: "broken" }]
    settled.fail = new Set(["broken"])

    await advanceWorkingLadders()
    expect(lastPass.error).toBe("this wallet is broken")

    // A second pass a second later must not report health it has not seen.
    await advanceWorkingLadders()
    expect(lastPass.error).toBe("this wallet is broken")
  })

  it("stops saying so once a wallet works again", async () => {
    walletRows.value = [{ userId: "u1", walletId: "broken" }]
    settled.fail = new Set(["broken"])
    await advanceWorkingLadders()
    expect(lastPass.error).toBe("this wallet is broken")

    settled.fail = new Set()
    await advanceWorkingLadders()
    expect(lastPass.error).toBeNull()
  })
})
