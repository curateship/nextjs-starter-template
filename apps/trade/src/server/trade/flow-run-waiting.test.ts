import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { defaultDcaParams } from "@/lib/trade/dca"
import type { TradeWallet } from "@/lib/trade/wallets"
import type { CustomShellDb } from "@/server/db"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { customShellAutomations } from "@/server/schema"
import { tradeFlowRuns, tradeSmartLadders, tradeWallets } from "@/server/trade/schema"

/**
 * What a pass records about the coins it could not place on.
 *
 * **The bug this guards against is silence.** Every refusal used to be caught
 * and thrown away, so a flow refusing every coin because the wallet had no free
 * cash was indistinguishable from a flow patiently waiting for the right price.
 * Both showed nothing happening, and only one of them was working.
 */

const NOW = 1_700_000_000_000

let client: PGlite
let db: CustomShellDb
let userId: string

const walletRow: TradeWallet = {
  id: "w1",
  label: "Practice",
  kind: "paper",
  status: "active",
  protocol: "hyperliquid",
  network: "mainnet",
  startingBalance: 10_000,
  address: null,
  hasKey: false,
  keyValidUntil: null,
}

/** What the placement path does per coin. Replaced per test. */
let place: (marketKey: string) => Promise<void> = async () => {}

vi.mock("@/server/trade/wallets", () => ({
  findWallet: async () => walletRow,
}))

vi.mock("@/server/trade/smart-orders", () => ({
  placeDcaLadder: async (
    _userId: string,
    _wallet: TradeWallet,
    input: { marketKey: string }
  ) => place(input.marketKey),
  cancelLadderRest: async () => {},
}))

vi.mock("@/server/trade/live-smart-orders", () => ({
  placeLiveDcaLadder: async (
    _userId: string,
    _wallet: TradeWallet,
    input: { marketKey: string }
  ) => place(input.marketKey),
  cancelLiveLadderRest: async () => ({ cancelled: 0 }),
}))

const { advanceFlowRuns } = await import("@/server/trade/flow-run")

const COINS = ["BTC", "ETH", "SOL"].map((one) => `hyperliquid:mainnet:${one}`)

async function startRun(marketKeys: string[] = COINS) {
  await db.insert(tradeFlowRuns).values({
    userId,
    walletId: "w1",
    id: "run-1",
    automationId: "flow-1",
    status: "running",
    spec: {
      protocol: "hyperliquid",
      network: "mainnet",
      marketKeys,
      strategy: {
        kind: "dca" as const,
        params: defaultDcaParams(),
        interval: "4h" as const,
      },
      capUsd: 500,
      walletLabel: "Practice",
      real: false,
    },
    startedAt: new Date(NOW),
    updatedAt: new Date(NOW),
  })
}

async function runRow() {
  const [row] = await db.select().from(tradeFlowRuns)
  return row
}

/** The hold, when the test's whole point is that there is one. */
async function holdOf() {
  const { hold } = await runRow()
  if (!hold) throw new Error("expected this flow to have stopped asking")
  return hold
}

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  userId = (await insertUser(db)).id
  place = async () => {}

  const workspace = await insertWorkspace(db)
  await db.insert(customShellAutomations).values({
    id: "flow-1",
    userId,
    workspaceId: workspace.id,
    name: "Flow 1",
    graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    compiledConfig: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  })

  await db.insert(tradeWallets).values({
    userId,
    id: "w1",
    label: "Practice",
    kind: "paper",
    status: "active",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 10_000,
  })

  // A flow already switched on, watching three coins. Tests that need a
  // different list delete this and start their own.
  await startRun()
})

afterEach(async () => {
  await client.close()
})

describe("why a coin has no ladder", () => {
  it("records the reason each coin was refused", async () => {
    place = async (marketKey) => {
      throw new Error(
        marketKey.endsWith("ETH") ? "SMART_LADDER_COST" : "SMART_LADDER_NO_BASE"
      )
    }

    await advanceFlowRuns(NOW, db)

    const row = await runRow()
    expect(row.waiting["hyperliquid:mainnet:ETH"]).toEqual({
      code: "SMART_LADDER_COST",
      at: NOW,
    })
    expect(row.waiting["hyperliquid:mainnet:BTC"].code).toBe(
      "SMART_LADDER_NO_BASE"
    )
    expect(row.placed).toEqual([])
  })

  it("forgets the reason once that coin gets its ladder", async () => {
    place = async () => {
      throw new Error("SMART_LADDER_NO_BASE")
    }
    await advanceFlowRuns(NOW, db)
    expect(Object.keys((await runRow()).waiting)).toHaveLength(3)

    place = async () => {}
    await advanceFlowRuns(NOW + 1_000, db)

    const row = await runRow()
    expect(row.waiting).toEqual({})
    expect(row.placed).toHaveLength(3)
  })

  it("clears a coin that has a ladder from somewhere else", async () => {
    place = async () => {
      throw new Error("SMART_LADDER_NO_BASE")
    }
    await advanceFlowRuns(NOW, db)

    // Placed by hand between passes. It is working now, whoever placed it, so
    // reporting it as still waiting would be wrong.
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "ladder-1",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "dca",
      status: "active",
      plan: { rungs: [] } as never,
    })

    await advanceFlowRuns(NOW + 1_000, db)

    expect((await runRow()).waiting["hyperliquid:mainnet:BTC"]).toBeUndefined()
  })

  it("stores a code and never an exception's own text", async () => {
    // An error thrown by something unexpected can carry anything that was in
    // scope. This row is read back onto a screen, so only the app's own codes
    // are ever kept.
    place = async () => {
      throw new Error("signing failed for key 0xdeadbeefdeadbeefdeadbeef")
    }

    await advanceFlowRuns(NOW, db)

    const stored = Object.values((await runRow()).waiting)
    expect(stored.every((one) => one.code === "FLOW_UNKNOWN")).toBe(true)
    expect(JSON.stringify(stored)).not.toContain("deadbeef")
  })

  it("looks at the longest-unchecked coins first", async () => {
    // A flow may watch hundreds. Without an order the same handful would be
    // retried every pass and the tail of the list would never be reached.
    const many = Array.from(
      { length: 20 },
      (_, index) => `hyperliquid:mainnet:C${index}`
    )
    await db.delete(tradeFlowRuns)
    await startRun(many)

    const seen: string[] = []
    place = async (marketKey) => {
      seen.push(marketKey)
      throw new Error("SMART_LADDER_NO_BASE")
    }

    await advanceFlowRuns(NOW, db)
    const first = [...seen]
    seen.length = 0
    await advanceFlowRuns(NOW + 1_000, db)

    // The second pass moves on rather than repeating the first.
    expect(first.length).toBeLessThan(many.length)
    expect(seen.some((one) => !first.includes(one))).toBe(true)
  })
})

describe("stopping when the same answer keeps coming back", () => {
  it("stops asking after three of the same refusal", async () => {
    // A long list, so stopping at three is visibly a decision rather than
    // simply running out of coins.
    await db.delete(tradeFlowRuns)
    await startRun(
      Array.from({ length: 40 }, (_, index) => `hyperliquid:mainnet:C${index}`)
    )

    const tried: string[] = []
    place = async (marketKey) => {
      tried.push(marketKey)
      throw new Error("SMART_RUNG_TOO_SMALL:1")
    }

    await advanceFlowRuns(NOW, db)

    // Three, out of forty it could have asked about.
    expect(tried).toHaveLength(3)
    const hold = await holdOf()
    expect(hold.code).toBe("SMART_RUNG_TOO_SMALL:1")
    expect(hold.strikes).toBe(3)
    expect(hold.until).toBeGreaterThan(NOW)
  })

  it("asks nothing at all while it is holding", async () => {
    place = async () => {
      throw new Error("SMART_LADDER_COST")
    }
    await advanceFlowRuns(NOW, db)

    const tried: string[] = []
    place = async (marketKey) => {
      tried.push(marketKey)
      throw new Error("SMART_LADDER_COST")
    }
    await advanceFlowRuns(NOW + 1_000, db)

    expect(tried).toEqual([])
  })

  it("comes back with one coin, not the whole list", async () => {
    place = async () => {
      throw new Error("SMART_LADDER_COST")
    }
    await advanceFlowRuns(NOW, db)
    const { until } = await holdOf()

    const tried: string[] = []
    place = async (marketKey) => {
      tried.push(marketKey)
      throw new Error("SMART_LADDER_COST")
    }
    await advanceFlowRuns(until + 1, db)

    // Being wrong about a hold costs one call, not a hundred.
    expect(tried).toHaveLength(1)
    expect((await holdOf()).strikes).toBe(4)
  })

  it("never holds for the coins that are simply waiting", async () => {
    // A hundred coins all saying "no base yet" is a hundred true answers about
    // a hundred different coins. Backing off there would be the flow switching
    // itself off for working correctly.
    place = async () => {
      throw new Error("SMART_LADDER_NO_BASE")
    }

    await advanceFlowRuns(NOW, db)

    expect((await runRow()).hold).toBeNull()
  })

  it("starts the count again when a different thing refuses it", async () => {
    let code = "SMART_LADDER_COST"
    place = async () => {
      throw new Error(code)
    }
    await advanceFlowRuns(NOW, db)
    expect((await holdOf()).strikes).toBe(3)

    code = "LIVE_WALLET_KEY"
    await advanceFlowRuns((await holdOf()).until + 1, db)

    // Two faults are two things to fix. Adding the second to the first's count
    // would hide it behind a wait it had nothing to do with.
    const again = await holdOf()
    expect(again.code).toBe("LIVE_WALLET_KEY")
    expect(again.strikes).toBe(1)
  })

  it("forgets the whole thing once one goes through", async () => {
    place = async () => {
      throw new Error("SMART_LADDER_COST")
    }
    await advanceFlowRuns(NOW, db)
    const held = await holdOf()

    place = async () => {}
    await advanceFlowRuns(held.until + 1, db)

    expect((await runRow()).hold).toBeNull()
  })
})

describe("what one pass is allowed to do", () => {
  it("stops after a few ladders even when every coin is ready", async () => {
    await db.delete(tradeFlowRuns)
    await startRun(
      Array.from({ length: 10 }, (_, index) => `hyperliquid:mainnet:C${index}`)
    )

    await advanceFlowRuns(NOW, db)

    // Ten coins all ready at once would be ten orders in a second, which is a
    // rate limit. A few a pass fills the list inside a minute.
    expect((await runRow()).placed).toHaveLength(3)
  })
})
