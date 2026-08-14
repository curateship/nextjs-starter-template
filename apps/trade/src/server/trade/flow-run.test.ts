import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
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
import {
  tradeFlowRuns,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

/**
 * Switching a flow on and off.
 *
 * Everything here is about a refusal writing nothing and a stop touching
 * nothing it should not. The placing itself belongs to the engine and is tested
 * where the engine is; what this file guards is the decisions taken before an
 * order can exist, and the one rule that matters most on the way out — a stop
 * never cancels the protection on a coin somebody is holding.
 */

const NOW = 1_700_000_000_000

let client: PGlite
let db: CustomShellDb
let userId: string

/** The wallet the store would return. Replaced per test. */
let walletRow: TradeWallet | null = null

vi.mock("@/server/trade/wallets", () => ({
  findWallet: async () => walletRow,
}))

/** What the exchange's feed says the wallet has money on. Null = no answer. */
const fundedMarkets = vi.hoisted(() => ({ value: null as string[] | null }))

vi.mock("@/server/protocols/hyperliquid/user-markets", () => ({
  awaitMarketsWalletHasMoneyOn: async () => fundedMarkets.value,
  marketsWalletHasMoneyOn: () => fundedMarkets.value,
}))

const { flowRunSpec, startFlowRun, stopFlowRun } = await import(
  "@/server/trade/flow-run"
)

function wallet(patch: Partial<TradeWallet> = {}): TradeWallet {
  return {
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
    ...patch,
  }
}

function nodes(patch: {
  wallet?: Record<string, unknown>
  markets?: Record<string, unknown>
} = {}) {
  return {
    wallet: {
      startingUsd: 10_000,
      takerFeePct: 0.045,
      makerFeePct: 0.015,
      slippagePct: 0.05,
      walletId: "w1",
      walletLabel: "Practice",
      walletKind: "paper",
      walletProtocol: "hyperliquid",
      walletNetwork: "mainnet",
      spendCapUsd: 500,
      ...patch.wallet,
    },
    markets: {
      protocol: "hyperliquid",
      marketKeys: ["hyperliquid:mainnet:BTC"],
      days: 30,
      from: null,
      to: null,
      ...patch.markets,
    },
    dca: { params: defaultDcaParams(), interval: "4h" },
  }
}

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  userId = (await insertUser(db)).id
  walletRow = wallet()
  fundedMarkets.value = null

  // Two real flows to hang the runs off. The table points at `automations` so
  // that deleting a flow stops it looking for coins, which means a test needs
  // one to exist.
  const workspace = await insertWorkspace(db)
  for (const id of ["flow-1", "flow-2"]) {
    await db.insert(customShellAutomations).values({
      id,
      userId,
      workspaceId: workspace.id,
      name: `Flow ${id}`,
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: null,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    })
  }

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
})

afterEach(async () => {
  await client.close()
})

describe("what a flow is allowed to start with", () => {
  it("freezes the coins, the settings and the cap", async () => {
    const { spec } = await flowRunSpec(userId, nodes())

    expect(spec.marketKeys).toEqual(["hyperliquid:mainnet:BTC"])
    expect(spec.capUsd).toBe(500)
    expect(spec.walletLabel).toBe("Practice")
    expect(spec.real).toBe(false)
  })

  it("always measures the ladder from the base, whatever the flow saved", async () => {
    // A flow has nothing to click, so "wherever price happens to be" would buy
    // halfway up a rally with no floor beneath it. Same rule a backtest forces.
    const clicked = nodes()
    clicked.dca = {
      params: { ...defaultDcaParams(), anchor: "click" },
      interval: "4h",
    }
    const { spec } = await flowRunSpec(userId, clicked)

    expect(spec.params.anchor).toBe("base")
  })

  it("refuses a flow with no cap", async () => {
    await expect(
      flowRunSpec(userId, nodes({ wallet: { spendCapUsd: null } }))
    ).rejects.toThrow("FLOW_NO_CAP")
  })

  it("refuses a flow with no wallet", async () => {
    await expect(
      flowRunSpec(userId, nodes({ wallet: { walletId: null } }))
    ).rejects.toThrow("FLOW_NO_WALLET")
  })

  it("refuses a wallet that has been switched off", async () => {
    walletRow = wallet({ status: "inactive" })
    await expect(flowRunSpec(userId, nodes())).rejects.toThrow(
      "FLOW_WALLET_INACTIVE"
    )
  })

  it("refuses a real wallet with no trading key", async () => {
    walletRow = wallet({ kind: "live", address: "0x1", hasKey: false })
    await expect(flowRunSpec(userId, nodes())).rejects.toThrow(
      "FLOW_WALLET_KEY"
    )
  })

  it("refuses a coin the wallet's exchange could never trade", async () => {
    // Checked on every coin, not a sample: one stray key would be refused at
    // the moment it tried to buy, days later, with the flow looking healthy.
    await expect(
      flowRunSpec(
        userId,
        nodes({
          markets: {
            marketKeys: ["hyperliquid:mainnet:BTC", "binance:mainnet:ETH"],
          },
        })
      )
    ).rejects.toThrow("FLOW_WRONG_EXCHANGE")
  })

  it("refuses a coin on a market the wallet has no money on", async () => {
    // Hyperliquid keeps each market's money separate: a rung fired on a
    // market holding none of the wallet's cash is refused every time, forever.
    // Caught here, at the one moment somebody can fix the coin list.
    walletRow = wallet({ kind: "live", address: "0xabc", hasKey: true })
    fundedMarkets.value = [""]
    await expect(
      flowRunSpec(
        userId,
        nodes({
          markets: {
            marketKeys: [
              "hyperliquid:mainnet:BTC",
              "hyperliquid:mainnet:magm:OBOA4",
            ],
          },
        })
      )
    ).rejects.toThrow("FLOW_UNFUNDED_MARKET")
  })

  it("skips the funded-market check when the exchange has not answered", async () => {
    // Silence is not an empty wallet. A coin hidden because the feed had not
    // spoken would be a flow refused over nothing.
    walletRow = wallet({ kind: "live", address: "0xabc", hasKey: true })
    fundedMarkets.value = null
    process.env.TRADE_ENABLE_MAINNET = "true"
    const { spec } = await flowRunSpec(
      userId,
      nodes({
        markets: {
          marketKeys: ["hyperliquid:mainnet:magm:OBOA4"],
        },
      })
    )
    delete process.env.TRADE_ENABLE_MAINNET
    expect(spec.marketKeys).toEqual(["hyperliquid:mainnet:magm:OBOA4"])
  })

  it("refuses a flow with no coins", async () => {
    await expect(
      flowRunSpec(userId, nodes({ markets: { marketKeys: [] } }))
    ).rejects.toThrow("FLOW_NO_COINS")
  })
})

describe("switching one on", () => {
  it("writes a running row and places nothing itself", async () => {
    const { id } = await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )

    const [row] = await db
      .select()
      .from(tradeFlowRuns)
      .where(eq(tradeFlowRuns.id, id))
    expect(row.status).toBe("running")
    expect(row.spec.capUsd).toBe(500)
    expect(row.walletId).toBe("w1")
  })

  it("refuses a second copy of the same flow", async () => {
    await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    await expect(
      startFlowRun(
        userId,
        { automationId: "flow-1", nodes: nodes(), now: NOW },
        db
      )
    ).rejects.toThrow("FLOW_ALREADY_RUNNING")
  })

  it("refuses a second flow on the same wallet", async () => {
    // Two flows on one wallet would place a second ladder on every shared coin
    // and double the position with nothing on screen to say so.
    await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    await expect(
      startFlowRun(
        userId,
        { automationId: "flow-2", nodes: nodes(), now: NOW },
        db
      )
    ).rejects.toThrow("FLOW_WALLET_BUSY")
  })

  it("writes nothing at all when it refuses", async () => {
    await expect(
      startFlowRun(
        userId,
        {
          automationId: "flow-1",
          nodes: nodes({ wallet: { spendCapUsd: null } }),
          now: NOW,
        },
        db
      )
    ).rejects.toThrow("FLOW_NO_CAP")

    const rows = await db.select().from(tradeFlowRuns)
    expect(rows).toHaveLength(0)
  })
})

describe("switching one off", () => {
  it("leaves a ladder the flow never placed alone", async () => {
    // The flow refuses a coin that already has a smart order on it, so a
    // hand-placed ladder on one of its coins is common — and cancelling it
    // because a flow was switched off would be taking away an order somebody
    // gave by hand.
    await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "by-hand",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "dca",
      status: "active",
      plan: { rungs: [] } as never,
    })

    const outcome = await stopFlowRun(
      userId,
      { automationId: "flow-1", now: NOW + 1 },
      db
    )

    expect(outcome).toEqual({ cancelled: 0, held: 0 })
    const [still] = await db
      .select({ status: tradeSmartLadders.status })
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.id, "by-hand"))
    expect(still.status).toBe("active")
  })


  it("says so when there was nothing running", async () => {
    expect(
      await stopFlowRun(userId, { automationId: "flow-1", now: NOW }, db)
    ).toBeNull()
  })

  it("marks it stopped and remembers why", async () => {
    await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    const outcome = await stopFlowRun(
      userId,
      { automationId: "flow-1", now: NOW + 1, reason: "Switched off by hand." },
      db
    )

    expect(outcome).toEqual({ cancelled: 0, held: 0 })
    const [row] = await db.select().from(tradeFlowRuns)
    expect(row.status).toBe("stopped")
    expect(row.stoppedReason).toBe("Switched off by hand.")
  })

  it("lets the same flow be started again afterwards", async () => {
    await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    await stopFlowRun(userId, { automationId: "flow-1", now: NOW + 1 }, db)

    await expect(
      startFlowRun(
        userId,
        { automationId: "flow-1", nodes: nodes(), now: NOW + 2 },
        db
      )
    ).resolves.toBeTruthy()
  })
})
