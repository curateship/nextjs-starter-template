import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { defaultSignalIndicators } from "@/lib/automations/nodes/trade-signals"
import { defaultIndicatorSettings } from "@/lib/trade/indicators/registry"
import { defaultDcaParams } from "@/lib/trade/dca"
import { describeFlowStop } from "@/lib/trade/flow-run"
import type { TradeWallet } from "@/lib/trade/wallets"
import type { CustomShellDb } from "@/server/db"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  customShellAnnouncements,
  customShellAutomations,
  customShellNotifications,
} from "@/server/schema"
import {
  tradeFlowRuns,
  tradeSmartLadders,
  tradeWallets,
  tradeWorkerControls,
} from "@/server/trade/schema"
import {
  createMarketFolder,
  deleteMarketFolder,
  setMarketInFolder,
} from "@/server/trade/market-folders"
import { assertFlowRunAcceptingPlacements } from "@/server/trade/flow-run-orders"

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

const liveCancel = vi.hoisted(() =>
  vi.fn(async () => ({ complete: true, done: true }))
)
const liveSignalCancel = vi.hoisted(() =>
  vi.fn(async () => ({ complete: true, done: true }))
)
const liveRemainderCancel = vi.hoisted(() =>
  vi.fn(async () => ({ complete: true, done: true }))
)
const paperRemainderCancel = vi.hoisted(() =>
  vi.fn(async () => ({ complete: true, done: true }))
)
const paperPlace = vi.hoisted(() =>
  vi.fn(
    async (_userId: string, _wallet: unknown, _input: { marketKey: string }) =>
      undefined
  )
)

vi.mock("@/server/trade/wallets", () => ({
  findWallet: async () => walletRow,
}))

vi.mock("@/server/protocols/hyperliquid/user-markets", () => ({
  awaitMarketsWalletHasMoneyOn: async () => null,
  marketsWalletHasMoneyOn: () => null,
}))

// The real-money Settings toggle reads the app database, which these tests
// replace with their own. The gate's own behaviour is pinned down in
// `workers.test.ts`; here it only has to not stand in the way.
vi.mock("@/server/protocols/real-money", () => ({
  assertRealMoneySwitchOn: async () => {},
  assertRealOrdersAllowed: () => {},
}))

vi.mock("@/server/trade/live-smart-orders", () => ({
  placeLiveDcaLadder: async () => {},
  cancelLiveFlowLadderRest: liveCancel,
  cancelLiveFlowLadderRemainder: liveRemainderCancel,
  cancelLiveSignalRest: liveSignalCancel,
}))

vi.mock("@/server/trade/smart-orders", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  placeDcaLadder: paperPlace,
  cancelFlowLadderRemainder: paperRemainderCancel,
}))

const {
  advanceRemovedFlowLadders,
  advanceRunningFlows,
  advanceStoppingFlows,
  flowRunSpec,
  startFlowRun,
  stopFlowRun,
} = await import("@/server/trade/flow-run")
type FlowNodes = Parameters<typeof flowRunSpec>[1]

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

function nodes(
  patch: {
    wallet?: Record<string, unknown>
    markets?: Record<string, unknown>
  } = {}
): FlowNodes {
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
    strategy: {
      kind: "dca" as const,
      settings: { params: defaultDcaParams(), interval: "4h" },
    },
  }
}

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  userId = (await insertUser(db)).id
  walletRow = wallet()
  liveCancel.mockReset()
  liveCancel.mockResolvedValue({ complete: true, done: true })
  liveSignalCancel.mockReset()
  liveSignalCancel.mockResolvedValue({ complete: true, done: true })
  liveRemainderCancel.mockReset()
  liveRemainderCancel.mockResolvedValue({ complete: true, done: true })
  paperRemainderCancel.mockReset()
  paperRemainderCancel.mockResolvedValue({ complete: true, done: true })
  paperPlace.mockReset()
  paperPlace.mockResolvedValue(undefined)

  // Two real flows to hang the runs off. The table points at `automations` so
  // that deleting a flow stops it looking for coins, which means a test needs
  // one to exist.
  // Owned by the same person, so a stop's bell notice has a workspace to
  // hang its announcement row on — the way a real account always does.
  const workspace = await insertWorkspace(db, { userId })
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
  it("freezes the coins and settings without reading the old wallet cap", async () => {
    const { spec } = await flowRunSpec(userId, nodes())

    expect(spec.marketKeys).toEqual(["hyperliquid:mainnet:BTC"])
    expect(spec.capUsd).toBe(10_000)
    expect(spec.walletLabel).toBe("Practice")
    expect(spec.real).toBe(false)
  })

  it("accepts Aster mainnet markets for an Aster mainnet live wallet", async () => {
    walletRow = wallet({
      label: "Aster main",
      kind: "live",
      protocol: "aster",
      network: "mainnet",
      address: "0x1",
      hasKey: true,
    })

    const { spec } = await flowRunSpec(
      userId,
      nodes({
        wallet: {
          walletLabel: "Aster main",
          walletKind: "live",
          walletProtocol: "aster",
          walletNetwork: "mainnet",
        },
        markets: {
          protocol: "aster",
          marketKeys: ["aster:mainnet:BTCUSDT"],
        },
      })
    )

    expect(spec).toMatchObject({
      protocol: "aster",
      network: "mainnet",
      marketKeys: ["aster:mainnet:BTCUSDT"],
      walletLabel: "Aster main",
      real: true,
    })
  })

  it("refuses an Aster testnet market for an Aster mainnet wallet", async () => {
    walletRow = wallet({
      label: "Aster main",
      kind: "live",
      protocol: "aster",
      network: "mainnet",
      address: "0x1",
      hasKey: true,
    })

    await expect(
      flowRunSpec(
        userId,
        nodes({
          wallet: {
            walletLabel: "Aster main",
            walletKind: "live",
            walletProtocol: "aster",
            walletNetwork: "mainnet",
          },
          markets: {
            protocol: "aster",
            marketKeys: ["aster:testnet:BTCUSDT"],
          },
        })
      )
    ).rejects.toThrow("FLOW_WRONG_EXCHANGE")
  })

  it("always measures the ladder from the base, whatever the flow saved", async () => {
    // A flow has nothing to click, so "wherever price happens to be" would buy
    // halfway up a rally with no floor beneath it. Same rule a backtest forces.
    const clicked = nodes()
    clicked.strategy = {
      kind: "dca",
      settings: {
        params: { ...defaultDcaParams(), anchor: "click" },
        interval: "4h",
      },
    }
    const { spec } = await flowRunSpec(userId, clicked)

    expect(spec.strategy.kind).toBe("dca")
    if (spec.strategy.kind !== "dca") throw new Error("expected a ladder")
    expect(spec.strategy.params.anchor).toBe("base")
  })

  it("refuses a signals flow with nothing switched on", async () => {
    // It would switch on looking perfectly healthy and then never buy
    // anything, which is the exact silence this whole function exists to
    // prevent — refused at the button, not at a first buy that never comes.
    const quiet = nodes()
    quiet.strategy = {
      kind: "signals",
      settings: {
        indicators: defaultIndicatorSettings(),
        interval: "4h",
        stakePct: 20,
        chaseGiveUpPct: 1,
      },
    }

    await expect(flowRunSpec(userId, quiet)).rejects.toThrow(
      "FLOW_NO_INDICATORS"
    )
  })

  it("freezes a signals strategy as a share, not a percent", async () => {
    const loud = nodes()
    loud.strategy = {
      kind: "signals",
      settings: {
        indicators: defaultSignalIndicators(),
        interval: "4h",
        stakePct: 20,
        chaseGiveUpPct: 2,
      },
    }

    const { spec } = await flowRunSpec(userId, loud)

    expect(spec.strategy.kind).toBe("signals")
    if (spec.strategy.kind !== "signals") throw new Error("expected signals")
    expect(spec.strategy.stakePct).toBe(20)
    // Everything that reads this multiplies it by a price, so the hundred is
    // divided out once here rather than in every reader.
    expect(spec.strategy.chaseGiveUp).toBe(0.02)
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

  it("refuses a flow with no coins", async () => {
    await expect(
      flowRunSpec(userId, nodes({ markets: { marketKeys: [] } }))
    ).rejects.toThrow("FLOW_NO_COINS")
  })

  it("reads a folder again each time the flow starts", async () => {
    const folders = await createMarketFolder(
      userId,
      {
        protocol: "hyperliquid",
        network: "mainnet",
        name: "Daily",
        marketKey: "hyperliquid:mainnet:ETH",
      },
      db
    )
    const daily = folders.find((folder) => folder.name === "Daily")!

    const { spec } = await flowRunSpec(
      userId,
      nodes({
        markets: {
          folderId: daily.id,
          folderName: daily.name,
          folderCount: 1,
          marketKeys: [],
        },
      })
    )

    expect(spec.folderId).toBe(daily.id)
    expect(spec.marketKeys).toEqual(["hyperliquid:mainnet:ETH"])
  })

  it("names a deleted folder when the next start refuses", async () => {
    const folders = await createMarketFolder(
      userId,
      { protocol: "hyperliquid", network: "mainnet", name: "Daily" },
      db
    )
    const daily = folders.find((folder) => folder.name === "Daily")!
    await deleteMarketFolder(userId, daily.id, db)

    await expect(
      flowRunSpec(
        userId,
        nodes({
          markets: {
            folderId: daily.id,
            folderName: daily.name,
            folderCount: 0,
            marketKeys: [],
          },
        })
      )
    ).rejects.toThrow("FLOW_EMPTY_FOLDER:Daily")
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
    expect(row.spec.capUsd).toBe(10_000)
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
})

describe("changing a folder while its flow is running", () => {
  it("adds the new coin to the right run and looks at it first", async () => {
    const folders = await createMarketFolder(
      userId,
      {
        protocol: "hyperliquid",
        network: "mainnet",
        name: "Daily",
        marketKey: "hyperliquid:mainnet:BTC",
      },
      db
    )
    const daily = folders.find((folder) => folder.name === "Daily")!
    const withOther = await createMarketFolder(
      userId,
      { protocol: "hyperliquid", network: "mainnet", name: "Other" },
      db
    )
    const other = withOther.find((folder) => folder.name === "Other")!
    const started = await startFlowRun(
      userId,
      {
        automationId: "flow-1",
        nodes: nodes({
          markets: {
            folderId: daily.id,
            folderName: daily.name,
            folderCount: 1,
            marketKeys: [],
          },
        }),
        now: NOW,
      },
      db
    )
    await db
      .update(tradeFlowRuns)
      .set({
        waiting: {
          "hyperliquid:mainnet:BTC": { code: "FLOW_NO_BASE", at: NOW },
        },
      })
      .where(eq(tradeFlowRuns.id, started.id))

    await setMarketInFolder(
      userId,
      {
        folderId: other.id,
        marketKey: "hyperliquid:mainnet:SOL",
        saved: true,
      },
      db
    )
    expect((await db.select().from(tradeFlowRuns))[0].spec.marketKeys).toEqual([
      "hyperliquid:mainnet:BTC",
    ])

    await setMarketInFolder(
      userId,
      {
        folderId: daily.id,
        marketKey: "hyperliquid:mainnet:ETH",
        saved: true,
      },
      db
    )
    await setMarketInFolder(
      userId,
      {
        folderId: daily.id,
        marketKey: "hyperliquid:mainnet:ETH",
        saved: true,
      },
      db
    )
    const [run] = await db.select().from(tradeFlowRuns)
    expect(run.spec.marketKeys).toEqual([
      "hyperliquid:mainnet:ETH",
      "hyperliquid:mainnet:BTC",
    ])
    const [control] = await db.select().from(tradeWorkerControls)
    expect(control.flowScanRequestedAt).not.toBeNull()

    await advanceRunningFlows(NOW + 1, db)
    expect(paperPlace).toHaveBeenCalled()
    expect(paperPlace.mock.calls[0]?.[2]).toMatchObject({
      marketKey: "hyperliquid:mainnet:ETH",
    })
  })

  it("adds to a paused run without asking for an immediate hunt", async () => {
    const folders = await createMarketFolder(
      userId,
      {
        protocol: "hyperliquid",
        network: "mainnet",
        name: "Daily",
        marketKey: "hyperliquid:mainnet:BTC",
      },
      db
    )
    const daily = folders.find((folder) => folder.name === "Daily")!
    const started = await startFlowRun(
      userId,
      {
        automationId: "flow-1",
        nodes: nodes({
          markets: {
            folderId: daily.id,
            folderName: daily.name,
            folderCount: 1,
            marketKeys: [],
          },
        }),
        now: NOW,
      },
      db
    )
    await db
      .update(tradeFlowRuns)
      .set({ pausedAt: new Date(NOW + 1) })
      .where(eq(tradeFlowRuns.id, started.id))

    await setMarketInFolder(
      userId,
      {
        folderId: daily.id,
        marketKey: "hyperliquid:mainnet:ETH",
        saved: true,
      },
      db
    )

    expect(
      (await db.select().from(tradeFlowRuns))[0].spec.marketKeys
    ).toContain("hyperliquid:mainnet:ETH")
    const [control] = await db.select().from(tradeWorkerControls)
    expect(control.flowScanRequestedAt).toBeNull()
  })

  it("removes a coin before cleanup and cancels only that run's live ladder", async () => {
    walletRow = wallet({ kind: "live", address: "0x1", hasKey: true })
    const folders = await createMarketFolder(
      userId,
      {
        protocol: "hyperliquid",
        network: "mainnet",
        name: "Daily",
        marketKey: "hyperliquid:mainnet:BTC",
      },
      db
    )
    const daily = folders.find((folder) => folder.name === "Daily")!
    const started = await startFlowRun(
      userId,
      {
        automationId: "flow-1",
        nodes: nodes({
          wallet: {
            walletKind: "live",
            walletAddress: "0x1",
            walletHasKey: true,
          },
          markets: {
            folderId: daily.id,
            folderName: daily.name,
            folderCount: 1,
            marketKeys: [],
          },
        }),
        now: NOW,
      },
      db
    )
    await db.insert(tradeSmartLadders).values([
      {
        userId,
        walletId: "w1",
        id: "flow-ladder",
        marketKey: "hyperliquid:mainnet:BTC",
        kind: "dca",
        status: "active",
        flowRunId: started.id,
        plan: { rungs: [{ status: "filled" }, { status: "waiting" }] } as never,
      },
      {
        userId,
        walletId: "w1",
        id: "hand-ladder",
        marketKey: "hyperliquid:mainnet:BTC",
        kind: "dca",
        status: "active",
        flowRunId: null,
        plan: { rungs: [{ status: "waiting" }] } as never,
      },
      {
        userId,
        walletId: "w1",
        id: "flow-signal",
        marketKey: "hyperliquid:mainnet:BTC",
        kind: "signal",
        status: "active",
        flowRunId: started.id,
        plan: { phase: "buying" } as never,
      },
    ])

    await setMarketInFolder(
      userId,
      {
        folderId: daily.id,
        marketKey: "hyperliquid:mainnet:BTC",
        saved: false,
      },
      db
    )
    const [removed] = await db.select().from(tradeFlowRuns)
    expect(removed.spec.marketKeys).toEqual([])
    const removalToken = removed.marketCancels["hyperliquid:mainnet:BTC"]
    expect(removalToken).toBeTruthy()
    await setMarketInFolder(
      userId,
      {
        folderId: daily.id,
        marketKey: "hyperliquid:mainnet:BTC",
        saved: false,
      },
      db
    )
    expect(
      (await db.select().from(tradeFlowRuns))[0].marketCancels[
        "hyperliquid:mainnet:BTC"
      ]
    ).toBe(removalToken)
    await expect(
      assertFlowRunAcceptingPlacements(
        db,
        userId,
        started.id,
        "hyperliquid:mainnet:BTC"
      )
    ).rejects.toThrow("FLOW_NOT_ACCEPTING_PLACEMENTS")

    await advanceRemovedFlowLadders(NOW + 1, db)

    expect(liveRemainderCancel).toHaveBeenCalledOnce()
    expect(liveRemainderCancel).toHaveBeenCalledWith(userId, walletRow, {
      ladderId: "flow-ladder",
    })
    expect(liveSignalCancel).toHaveBeenCalledWith(userId, walletRow, {
      signalId: "flow-signal",
      now: NOW + 1,
    })
    expect(paperRemainderCancel).not.toHaveBeenCalled()
    expect((await db.select().from(tradeFlowRuns))[0].marketCancels).toEqual({})
  })

  it("cleans a paused practice run through the practice path", async () => {
    const folders = await createMarketFolder(
      userId,
      {
        protocol: "hyperliquid",
        network: "mainnet",
        name: "Daily",
        marketKey: "hyperliquid:mainnet:BTC",
      },
      db
    )
    const daily = folders.find((folder) => folder.name === "Daily")!
    const started = await startFlowRun(
      userId,
      {
        automationId: "flow-1",
        nodes: nodes({
          markets: {
            folderId: daily.id,
            folderName: daily.name,
            folderCount: 1,
            marketKeys: [],
          },
        }),
        now: NOW,
      },
      db
    )
    await db
      .update(tradeFlowRuns)
      .set({ pausedAt: new Date(NOW + 1) })
      .where(eq(tradeFlowRuns.id, started.id))
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "practice-ladder",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "dca",
      status: "active",
      flowRunId: started.id,
      plan: { rungs: [{ status: "waiting" }] } as never,
    })
    await setMarketInFolder(
      userId,
      {
        folderId: daily.id,
        marketKey: "hyperliquid:mainnet:BTC",
        saved: false,
      },
      db
    )

    await advanceRemovedFlowLadders(NOW + 2, db)

    expect(paperRemainderCancel).toHaveBeenCalledWith(userId, walletRow, {
      ladderId: "practice-ladder",
    })
  })

  it("keeps a failed live cancellation queued and sends one notice", async () => {
    walletRow = wallet({ kind: "live", address: "0x1", hasKey: true })
    liveRemainderCancel.mockRejectedValueOnce(new Error("exchange busy"))
    const folders = await createMarketFolder(
      userId,
      {
        protocol: "hyperliquid",
        network: "mainnet",
        name: "Daily",
        marketKey: "hyperliquid:mainnet:BTC",
      },
      db
    )
    const daily = folders.find((folder) => folder.name === "Daily")!
    const started = await startFlowRun(
      userId,
      {
        automationId: "flow-1",
        nodes: nodes({
          wallet: {
            walletKind: "live",
            walletAddress: "0x1",
            walletHasKey: true,
          },
          markets: {
            folderId: daily.id,
            folderName: daily.name,
            folderCount: 1,
            marketKeys: [],
          },
        }),
        now: NOW,
      },
      db
    )
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "stuck-ladder",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "dca",
      status: "active",
      flowRunId: started.id,
      plan: { rungs: [{ status: "waiting" }] } as never,
    })
    await setMarketInFolder(
      userId,
      {
        folderId: daily.id,
        marketKey: "hyperliquid:mainnet:BTC",
        saved: false,
      },
      db
    )

    await advanceRemovedFlowLadders(NOW + 1, db)
    let [run] = await db.select().from(tradeFlowRuns)
    expect(run.marketCancels["hyperliquid:mainnet:BTC"]).toBeTruthy()
    expect(run.waiting["hyperliquid:mainnet:BTC"]?.code).toBe(
      "FLOW_CANCEL_FAILED"
    )
    expect(await db.select().from(customShellAnnouncements)).toHaveLength(1)

    await advanceRemovedFlowLadders(NOW + 2, db)
    ;[run] = await db.select().from(tradeFlowRuns)
    expect(run.marketCancels).toEqual({})
    expect(run.waiting["hyperliquid:mainnet:BTC"]).toBeUndefined()
    expect(await db.select().from(customShellAnnouncements)).toHaveLength(1)
  })

  it("keeps an unconfirmed live cancellation queued without warning", async () => {
    walletRow = wallet({ kind: "live", address: "0x1", hasKey: true })
    liveSignalCancel
      .mockResolvedValueOnce({ complete: false, done: false })
      .mockResolvedValueOnce({ complete: true, done: true })
    const folders = await createMarketFolder(
      userId,
      {
        protocol: "hyperliquid",
        network: "mainnet",
        name: "Daily",
        marketKey: "hyperliquid:mainnet:BTC",
      },
      db
    )
    const daily = folders.find((folder) => folder.name === "Daily")!
    const started = await startFlowRun(
      userId,
      {
        automationId: "flow-1",
        nodes: nodes({
          wallet: {
            walletKind: "live",
            walletAddress: "0x1",
            walletHasKey: true,
          },
          markets: {
            folderId: daily.id,
            folderName: daily.name,
            folderCount: 1,
            marketKeys: [],
          },
        }),
        now: NOW,
      },
      db
    )
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "unconfirmed-signal",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "signal",
      status: "active",
      flowRunId: started.id,
      plan: { phase: "buying" } as never,
    })
    await setMarketInFolder(
      userId,
      {
        folderId: daily.id,
        marketKey: "hyperliquid:mainnet:BTC",
        saved: false,
      },
      db
    )

    await advanceRemovedFlowLadders(NOW + 1, db)
    let [run] = await db.select().from(tradeFlowRuns)
    expect(run.marketCancels["hyperliquid:mainnet:BTC"]).toBeTruthy()
    expect(run.waiting["hyperliquid:mainnet:BTC"]).toBeUndefined()
    expect(await db.select().from(customShellAnnouncements)).toHaveLength(0)

    await advanceRemovedFlowLadders(NOW + 2, db)
    ;[run] = await db.select().from(tradeFlowRuns)
    expect(run.marketCancels).toEqual({})
    expect(await db.select().from(customShellAnnouncements)).toHaveLength(0)
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

    expect(outcome).toEqual({ held: 0, remaining: 0 })
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

    expect(outcome).toEqual({ held: 0, remaining: 0 })
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

  it("can finish a stop that was interrupted after pausing the run", async () => {
    await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    await db
      .update(tradeFlowRuns)
      .set({ pausedAt: new Date(NOW + 1) })
      .where(eq(tradeFlowRuns.automationId, "flow-1"))

    await expect(
      stopFlowRun(
        userId,
        { automationId: "flow-1", now: NOW + 2, byHand: true },
        db
      )
    ).resolves.toEqual({ held: 0, remaining: 0 })
    const [run] = await db.select().from(tradeFlowRuns)
    expect(run.status).toBe("stopped")
  })

  it("uses the live cancel path for a ladder owned by the run row", async () => {
    walletRow = wallet({
      label: "Live",
      kind: "live",
      address: "0x1",
      hasKey: true,
    })
    const started = await startFlowRun(
      userId,
      {
        automationId: "flow-1",
        nodes: nodes({
          wallet: {
            walletLabel: "Live",
            walletKind: "live",
            walletAddress: "0x1",
            walletHasKey: true,
          },
        }),
        now: NOW,
      },
      db
    )
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "live-ladder",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "dca",
      status: "active",
      flowRunId: started.id,
      plan: { rungs: [{ status: "waiting" }] } as never,
    })
    const outcome = await stopFlowRun(
      userId,
      { automationId: "flow-1", now: NOW + 1, byHand: true },
      db
    )

    expect(outcome).toEqual({ held: 0, remaining: 1 })
    expect(liveCancel).not.toHaveBeenCalled()
    const [stopping] = await db.select().from(tradeFlowRuns)
    expect(stopping.status).toBe("stopping")

    await advanceStoppingFlows(NOW + 2, db)
    expect(liveCancel).toHaveBeenCalledOnce()
    expect(liveCancel).toHaveBeenCalledWith(userId, walletRow, {
      ladderId: "live-ladder",
    })
    const [stopped] = await db.select().from(tradeFlowRuns)
    expect(stopped.status).toBe("stopped")
  })

  it("finishes a live signal stop without relying on normal wallet work", async () => {
    walletRow = wallet({
      label: "Live",
      kind: "live",
      address: "0x1",
      hasKey: true,
    })
    const signalNodes = nodes({
      wallet: {
        walletLabel: "Live",
        walletKind: "live",
        walletAddress: "0x1",
        walletHasKey: true,
      },
    })
    signalNodes.strategy = {
      kind: "signals",
      settings: {
        indicators: defaultSignalIndicators(),
        interval: "4h",
        stakePct: 20,
        chaseGiveUpPct: 2,
      },
    }
    const started = await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: signalNodes, now: NOW },
      db
    )
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "live-signal",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "signal",
      status: "active",
      flowRunId: started.id,
      plan: { phase: "buying" } as never,
    })

    expect(
      await stopFlowRun(
        userId,
        { automationId: "flow-1", now: NOW + 1, byHand: true },
        db
      )
    ).toEqual({ held: 0, remaining: 1 })
    await advanceStoppingFlows(NOW + 2, db)

    expect(liveSignalCancel).toHaveBeenCalledWith(userId, walletRow, {
      signalId: "live-signal",
      now: NOW + 2,
    })
    expect((await db.select().from(tradeFlowRuns))[0].status).toBe("stopped")
  })

  it("cancels three ladders per engine pass and then stops", async () => {
    walletRow = wallet({
      label: "Live",
      kind: "live",
      address: "0x1",
      hasKey: true,
    })
    const started = await startFlowRun(
      userId,
      {
        automationId: "flow-1",
        nodes: nodes({
          wallet: {
            walletLabel: "Live",
            walletKind: "live",
            walletAddress: "0x1",
            walletHasKey: true,
          },
        }),
        now: NOW,
      },
      db
    )
    await db.insert(tradeSmartLadders).values(
      Array.from({ length: 9 }, (_, index) => ({
        userId,
        walletId: "w1",
        id: `live-ladder-${index}`,
        marketKey: `hyperliquid:mainnet:COIN${index}`,
        kind: "dca" as const,
        status: "active" as const,
        flowRunId: started.id,
        plan: { rungs: [{ status: "waiting" }] } as never,
      }))
    )

    const outcome = await stopFlowRun(
      userId,
      { automationId: "flow-1", now: NOW + 1, byHand: true },
      db
    )
    expect(outcome?.remaining).toBe(9)
    expect(liveCancel).not.toHaveBeenCalled()
    await expect(
      startFlowRun(
        userId,
        {
          automationId: "flow-1",
          nodes: nodes({
            wallet: {
              walletLabel: "Live",
              walletKind: "live",
              walletAddress: "0x1",
              walletHasKey: true,
            },
          }),
          now: NOW + 2,
        },
        db
      )
    ).rejects.toThrow("FLOW_ALREADY_STOPPING")
    await expect(
      startFlowRun(
        userId,
        {
          automationId: "flow-2",
          nodes: nodes({
            wallet: {
              walletLabel: "Live",
              walletKind: "live",
              walletAddress: "0x1",
              walletHasKey: true,
            },
          }),
          now: NOW + 2,
        },
        db
      )
    ).rejects.toThrow("FLOW_WALLET_STOPPING")

    await advanceStoppingFlows(NOW + 2, db)
    expect(liveCancel).toHaveBeenCalledTimes(3)
    expect((await db.select().from(tradeFlowRuns))[0].status).toBe("stopping")
    await advanceStoppingFlows(NOW + 3, db)
    expect(liveCancel).toHaveBeenCalledTimes(6)
    await advanceStoppingFlows(NOW + 4, db)
    expect(liveCancel).toHaveBeenCalledTimes(9)
    expect((await db.select().from(tradeFlowRuns))[0].status).toBe("stopped")
  })

  it("leaves a ladder that bought something held", async () => {
    walletRow = wallet({ kind: "live", address: "0x1", hasKey: true })
    const started = await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "held-ladder",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "dca",
      status: "active",
      flowRunId: started.id,
      plan: { rungs: [{ status: "filled" }] } as never,
    })

    const outcome = await stopFlowRun(
      userId,
      { automationId: "flow-1", now: NOW + 1, byHand: true },
      db
    )
    expect(outcome).toEqual({ held: 1, remaining: 0 })
    expect(liveCancel).not.toHaveBeenCalled()
    expect((await db.select().from(tradeFlowRuns))[0].status).toBe("stopped")
  })

  it("cancels a ladder left behind by an older run of the same flow", async () => {
    walletRow = wallet({
      label: "Live",
      kind: "live",
      address: "0x1",
      hasKey: true,
    })
    const liveNodes = nodes({
      wallet: {
        walletLabel: "Live",
        walletKind: "live",
        walletAddress: "0x1",
        walletHasKey: true,
      },
    })
    const older = await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: liveNodes, now: NOW },
      db
    )
    await db
      .update(tradeFlowRuns)
      .set({ status: "stopped", stoppedAt: new Date(NOW + 1) })
      .where(eq(tradeFlowRuns.id, older.id))
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "older-live-ladder",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "dca",
      status: "active",
      flowRunId: older.id,
      plan: { rungs: [{ status: "waiting" }] } as never,
    })
    await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: liveNodes, now: NOW + 2 },
      db
    )

    const outcome = await stopFlowRun(
      userId,
      { automationId: "flow-1", now: NOW + 3, byHand: true },
      db
    )

    expect(outcome).toEqual({ held: 0, remaining: 1 })
    expect(liveCancel).not.toHaveBeenCalled()
    await advanceStoppingFlows(NOW + 4, db)
    expect(liveCancel).toHaveBeenCalledWith(userId, walletRow, {
      ladderId: "older-live-ladder",
    })
  })

  it("sends an active ladder through live recovery after old Stop cleared its ids", async () => {
    walletRow = wallet({ kind: "live", address: "0x1", hasKey: true })
    const started = await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "damaged-live-ladder",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "dca",
      status: "active",
      flowRunId: started.id,
      plan: { rungs: [{ status: "cancelled", orderId: null }] } as never,
    })

    expect(
      await stopFlowRun(
        userId,
        { automationId: "flow-1", now: NOW + 1, byHand: true },
        db
      )
    ).toEqual({ held: 0, remaining: 1 })

    await advanceStoppingFlows(NOW + 2, db)

    expect(liveCancel).toHaveBeenCalledWith(userId, walletRow, {
      ladderId: "damaged-live-ladder",
    })
    expect((await db.select().from(tradeFlowRuns))[0].status).toBe("stopped")
  })

  it("retries a refused live cancel on the next engine pass", async () => {
    walletRow = wallet({
      label: "Live",
      kind: "live",
      address: "0x1",
      hasKey: true,
    })
    liveCancel.mockRejectedValue(new Error("exchange busy"))
    const started = await startFlowRun(
      userId,
      {
        automationId: "flow-1",
        nodes: nodes({
          wallet: {
            walletLabel: "Live",
            walletKind: "live",
            walletAddress: "0x1",
            walletHasKey: true,
          },
        }),
        now: NOW,
      },
      db
    )
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "live-ladder",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "dca",
      status: "active",
      flowRunId: started.id,
      plan: { rungs: [{ status: "waiting" }] } as never,
    })
    // A placement error left on this coin must not suppress the stop failure's
    // notice. Stop has its own saved reason so only the repeat is silent.
    await db
      .update(tradeFlowRuns)
      .set({
        waiting: {
          "hyperliquid:mainnet:BTC": { code: "FLOW_UNKNOWN", at: NOW },
        },
      })
      .where(eq(tradeFlowRuns.id, started.id))

    const outcome = await stopFlowRun(
      userId,
      { automationId: "flow-1", now: NOW + 1, byHand: true },
      db
    )

    expect(outcome).toEqual({ held: 0, remaining: 1 })
    expect(describeFlowStop(outcome!)).toContain("1 ladder left")
    expect(liveCancel).not.toHaveBeenCalled()
    await advanceStoppingFlows(NOW + 2, db)
    await advanceStoppingFlows(NOW + 3, db)
    expect(liveCancel).toHaveBeenCalledTimes(2)
    const [run] = await db.select().from(tradeFlowRuns)
    expect(run.status).toBe("stopping")
    const announcements = await db.select().from(customShellAnnouncements)
    expect(announcements).toHaveLength(1)
    expect(announcements[0].body).toContain(
      "Stop could not call off BTC. It will keep trying."
    )
  })

  it("reports a ladder whose wallet can no longer be loaded", async () => {
    const started = await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    await db.insert(tradeSmartLadders).values({
      userId,
      walletId: "w1",
      id: "orphaned-ladder",
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "dca",
      status: "active",
      flowRunId: started.id,
      plan: { rungs: [{ status: "waiting" }] } as never,
    })
    await stopFlowRun(
      userId,
      { automationId: "flow-1", now: NOW + 1, byHand: true },
      db
    )
    walletRow = null

    await advanceStoppingFlows(NOW + 2, db)

    expect((await db.select().from(tradeFlowRuns))[0].status).toBe("stopping")
    const announcements = await db.select().from(customShellAnnouncements)
    expect(announcements).toHaveLength(1)
    expect(announcements[0].body).toContain(
      "Stop could not call off BTC. It will keep trying."
    )
  })
})

describe("who is told about a stop", () => {
  it("puts a notice in the owner's bell when the engine stopped it", async () => {
    await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    await stopFlowRun(
      userId,
      {
        automationId: "flow-1",
        now: NOW + 1,
        reason: "Practice was switched off.",
      },
      db
    )

    const notices = await db.select().from(customShellNotifications)
    expect(notices).toHaveLength(1)
    expect(notices[0].recipientUserId).toBe(userId)
    const [announcement] = await db.select().from(customShellAnnouncements)
    expect(announcement.title).toBe("Flow Flow flow-1 stopped")
    expect(announcement.body).toBe("Practice was switched off.")
    expect(announcement.level).toBe("warning")
    expect(announcement.showBanner).toBe(false)
  })

  it("stays silent when a person pressed Stop", async () => {
    await startFlowRun(
      userId,
      { automationId: "flow-1", nodes: nodes(), now: NOW },
      db
    )
    await stopFlowRun(
      userId,
      {
        automationId: "flow-1",
        now: NOW + 1,
        reason: "Switched off by hand.",
        byHand: true,
      },
      db
    )

    expect(await db.select().from(customShellNotifications)).toHaveLength(0)
  })
})
