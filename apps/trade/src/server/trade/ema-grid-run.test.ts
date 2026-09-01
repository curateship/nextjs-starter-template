import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  defaultTradeGridSettings,
  emaGridDaysForCleanHours,
} from "@/lib/recipes/trade-grid"
import type { CandleBar } from "@/lib/protocols/contracts"
import type { TradeFlowRunSpec } from "@/lib/trade/flow-run"
import type { GridPlan } from "@/lib/trade/grid"
import type { TradeWallet } from "@/lib/trade/wallets"
import type { CustomShellDb } from "@/server/db"
import { customShellAnnouncements } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import {
  tradeFlowRuns,
  tradePaperPositions,
  tradeRecipes,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

const BAR = 4 * 60 * 60 * 1_000
const BTC = "hyperliquid:mainnet:BTC"
const ETH = "hyperliquid:mainnet:ETH"
let mark = 100
let bars: CandleBar[] = []
let candleError: Error | null = null
const livePlace = vi.hoisted(() => vi.fn(async () => undefined))
const liveMarketOrder = vi.hoisted(() =>
  vi.fn(async () => ({
    status: "filled" as const,
    orderId: "close-1",
    avgPx: 100,
    filledSz: 1,
    protection: null,
    protectionNote: null,
  }))
)
const liveRollback = vi.hoisted(() => vi.fn(async () => true))
const liveHeld = vi.hoisted(() => vi.fn(async () => ({ szi: 10 })))
const liveReconcile = vi.hoisted(() => vi.fn(async () => undefined))
const paperClose = vi.hoisted(() => vi.fn(async () => undefined))
const pairedPlan = vi.hoisted(() => vi.fn(async (): Promise<unknown> => null))

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    capabilities: { gridStop: "exchange" },
    markets: {
      fetch: async () => ({
        protocol: "hyperliquid",
        protocolLabel: "Hyperliquid",
        network: "mainnet",
        networkLabel: "Mainnet",
        rows: [
          {
            key: BTC,
            marketId: "BTC",
            symbol: "BTC",
            subExchange: null,
            category: "crypto",
            sizeDecimals: 3,
            maxLeverage: 50,
            isolatedOnly: false,
            iconUrl: null,
            price: mark,
            change24h: null,
            volume24hUsd: 10_000_000,
            fundingHourly: null,
            openInterestUsd: null,
          },
          {
            key: ETH,
            marketId: "ETH",
            symbol: "ETH",
            subExchange: null,
            category: "crypto",
            sizeDecimals: 3,
            maxLeverage: 50,
            isolatedOnly: false,
            iconUrl: null,
            price: mark,
            change24h: null,
            volume24hUsd: 10_000_000,
            fundingHourly: null,
            openInterestUsd: null,
          },
        ],
      }),
      prices: async () =>
        new Map([
          ["BTC", mark],
          ["ETH", mark],
        ]),
      candles: async () => {
        if (candleError) throw candleError
        return bars
      },
      roundPx: (px: number) => Math.round(px * 1_000) / 1_000,
    },
    account: { fetch: async () => null },
  }),
}))

vi.mock("@/server/trade/live-grid-orders", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  placeLiveGridOrder: livePlace,
}))

vi.mock("@/server/trade/live-wallet-queue", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serializeLiveWallet: async (
    _userId: string,
    _wallet: TradeWallet,
    work: () => Promise<unknown>
  ) => await work(),
}))

vi.mock("@/server/trade/live-smart-orders", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  reconcileLiveLaddersOnce: liveReconcile,
}))

vi.mock("@/server/trade/live-orders", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  liveHeldPosition: liveHeld,
  placeLiveOrder: liveMarketOrder,
  rollbackLiveOrder: liveRollback,
}))

vi.mock("@/server/trade/paper", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  placePaperOrder: paperClose,
}))

vi.mock("@/server/trade/smart-pairing", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  pairedLadderPlan: pairedPlan,
}))

const { advanceEmaGridFlow } = await import("@/server/trade/ema-grid-run")
const { advanceRunningFlows } = await import("@/server/trade/flow-run")
const { resetCandlePacing } = await import("@/server/trade/signal-run")

let client: PGlite
let database: CustomShellDb
let userId: string
let wallet: TradeWallet
let now: number

function clean(side: "long" | "short"): CandleBar[] {
  return Array.from({ length: 600 }, (_, index) => {
    const cleanRun = index >= 582
    const price = cleanRun ? (side === "long" ? 111 : 89) : 100
    return {
      openTime: now - (600 - index) * BAR,
      open: price,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1,
    }
  })
}

function spec(potPct = 20): TradeFlowRunSpec {
  const settings = defaultTradeGridSettings()
  settings.grid.potPct = potPct
  return {
    protocol: "hyperliquid",
    network: "mainnet",
    folderId: null,
    marketKeys: [BTC],
    strategy: { kind: "emaGrid", settings, interval: "4h" },
    capUsd: 10_000,
    walletLabel: "Practice",
    real: false,
  }
}

function customRungSpec(rungPcts = [10, 20, 30, 40]): TradeFlowRunSpec {
  const runSpec = spec()
  if (runSpec.strategy.kind !== "emaGrid") {
    throw new Error("expected EMA Grid settings")
  }
  runSpec.strategy.settings.grid = {
    ...runSpec.strategy.settings.grid,
    levels: rungPcts.length,
    manualSizing: true,
    manualRungPcts: rungPcts,
    follow: true,
    followDown: true,
  }
  return runSpec
}

async function pass(
  acted: Record<string, number> = {},
  over: Partial<TradeFlowRunSpec> = {}
) {
  resetCandlePacing()
  const runSpec = { ...spec(), ...over }
  return await advanceEmaGridFlow(
    {
      userId,
      wallet,
      settings:
        runSpec.strategy.kind === "emaGrid"
          ? runSpec.strategy.settings
          : defaultTradeGridSettings(),
      marketKeys: runSpec.marketKeys,
      flowRunId: "run-1",
      lookedAt: {},
      acted,
      now,
    },
    database
  )
}

async function grids() {
  return await database
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.kind, "grid")
      )
    )
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  resetCandlePacing()
  livePlace.mockReset()
  livePlace.mockResolvedValue(undefined)
  liveMarketOrder.mockClear()
  liveRollback.mockClear()
  liveRollback.mockResolvedValue(true)
  liveHeld.mockClear()
  liveHeld.mockResolvedValue({ szi: 10 })
  liveReconcile.mockClear()
  paperClose.mockClear()
  pairedPlan.mockClear()
  pairedPlan.mockResolvedValue(null)
  now = Date.UTC(2026, 7, 28, 16)
  mark = 100
  bars = clean("long")
  candleError = null

  userId = (await insertUser(database)).id
  const workspace = await insertWorkspace(database, { userId })
  await database.insert(tradeRecipes).values({
    id: "flow-1",
    userId,
    workspaceId: workspace.id,
    name: "EMA Grid",
    graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    compiledConfig: null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  })
  await database.insert(tradeWallets).values({
    userId,
    id: "w1",
    label: "Practice",
    kind: "paper",
    status: "active",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 10_000,
  })
  await database.insert(tradeFlowRuns).values({
    userId,
    id: "run-1",
    walletId: "w1",
    automationId: "flow-1",
    status: "running",
    spec: spec(),
    startedAt: new Date(now),
    updatedAt: new Date(now),
  })
  wallet = {
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
})

afterEach(async () => {
  await client.close()
})

describe("placing and holding a flow grid", () => {
  it("places after one clean 4-hour candle when the wait is four hours", async () => {
    bars = clean("long").map((bar, index) =>
      index < 599 ? { ...bar, open: 100, high: 101, low: 99, close: 100 } : bar
    )

    expect((await pass()).did).toBe("waiting")
    const runSpec = spec()
    if (runSpec.strategy.kind !== "emaGrid") {
      throw new Error("expected EMA Grid settings")
    }
    runSpec.strategy.settings.days = emaGridDaysForCleanHours(4)

    expect((await pass({}, { strategy: runSpec.strategy })).did).toBe("placed")
  })

  it("places a buying grid through the ordinary grid path", async () => {
    const outcome = await pass()

    expect(outcome.did).toBe("placed")
    const [grid] = await grids()
    expect(grid.flowRunId).toBe("run-1")
    expect(grid.plan as GridPlan).toMatchObject({
      direction: "long",
      takeProfitPx: null,
      takeProfitPct: null,
    })
  })

  it("keeps price following and custom rung money on a buying grid", async () => {
    const runSpec = customRungSpec()

    expect((await pass({}, { strategy: runSpec.strategy })).did).toBe("placed")
    const [grid] = await grids()
    const plan = grid.plan as GridPlan
    expect(plan).toMatchObject({
      direction: "long",
      follow: true,
      followDown: true,
      manualSizing: true,
      // Plans store lowest price first. Rung 1 on a buying grid is the top.
      manualRungPcts: [40, 30, 20, 10],
    })
  })

  it("uses the live Grid placement path for a live wallet", async () => {
    wallet = {
      ...wallet,
      label: "Live",
      kind: "live",
      address: "0x1",
      hasKey: true,
    }

    expect((await pass()).did).toBe("placed")
    expect(livePlace).toHaveBeenCalledOnce()
    expect(livePlace).toHaveBeenCalledWith(
      userId,
      wallet,
      expect.objectContaining({
        marketKey: BTC,
        flowRunId: "run-1",
        params: expect.objectContaining({
          direction: "long",
          takeProfitPct: null,
        }),
      })
    )
  })

  it("mirrors custom rung money into a live selling grid", async () => {
    bars = clean("short")
    wallet = {
      ...wallet,
      label: "Live",
      kind: "live",
      address: "0x1",
      hasKey: true,
    }
    const runSpec = customRungSpec()

    expect((await pass({}, { strategy: runSpec.strategy })).did).toBe("placed")
    expect(livePlace).toHaveBeenCalledWith(
      userId,
      wallet,
      expect.objectContaining({
        params: expect.objectContaining({
          direction: "short",
          follow: true,
          followDown: true,
          manualSizing: true,
          // GridParams stores chart rows top first. A short's rung 1 is bottom.
          manualRungPcts: [40, 30, 20, 10],
        }),
      })
    )
  })

  it("holds a grid that already points the confirmed way", async () => {
    await pass()
    const outcome = await pass()

    expect(outcome).toEqual({ did: "holding", marketKey: BTC })
    expect(await grids()).toHaveLength(1)
  })

  it("rotates to the next coin after placing an active grid", async () => {
    await database
      .update(tradeFlowRuns)
      .set({ spec: { ...spec(), marketKeys: [BTC, ETH] } })

    resetCandlePacing()
    await advanceRunningFlows(now, database)
    resetCandlePacing()
    await advanceRunningFlows(now + 1, database)

    expect((await grids()).map((grid) => grid.marketKey).sort()).toEqual([
      BTC,
      ETH,
    ])
  })

  it("rotates the shared candle read across separate flows", async () => {
    const [firstFlow] = await database
      .select({ workspaceId: tradeRecipes.workspaceId })
      .from(tradeRecipes)
      .where(eq(tradeRecipes.id, "flow-1"))
    await database.insert(tradeRecipes).values({
      id: "flow-2",
      userId,
      workspaceId: firstFlow.workspaceId,
      name: "Second EMA Grid",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    await database
      .update(tradeFlowRuns)
      .set({ spec: { ...spec(), marketKeys: [BTC] } })
      .where(eq(tradeFlowRuns.id, "run-1"))
    await database.insert(tradeWallets).values({
      userId,
      id: "w2",
      label: "Practice 2",
      kind: "paper",
      status: "active",
      protocol: "hyperliquid",
      network: "mainnet",
      startingBalance: 10_000,
    })
    await database.insert(tradeFlowRuns).values({
      userId,
      id: "run-2",
      walletId: "w2",
      automationId: "flow-2",
      status: "running",
      spec: { ...spec(), marketKeys: [ETH], walletLabel: "Practice 2" },
      startedAt: new Date(now),
      updatedAt: new Date(now),
    })

    resetCandlePacing()
    await advanceRunningFlows(now + 100, database)
    resetCandlePacing()
    await advanceRunningFlows(now + 200, database)

    expect(
      (await grids())
        .map((grid) => `${grid.flowRunId}:${grid.marketKey}`)
        .sort()
    ).toEqual([`run-1:${BTC}`, `run-2:${ETH}`])
  })

  it("restarts after an emergency stop, but only on a new candle", async () => {
    const first = await pass()
    if (first.did !== "placed") throw new Error("expected a placement")
    await database
      .update(tradeSmartLadders)
      .set({ status: "done", updatedAt: new Date(now + 1) })
      .where(eq(tradeSmartLadders.kind, "grid"))

    const outcome = await pass({ [BTC]: first.at })

    expect(outcome).toMatchObject({
      did: "waiting",
      code: "EMA_GRID_NEW_CANDLE",
    })
    expect(await grids()).toHaveLength(1)

    now += BAR
    bars = clean("long")
    expect((await pass({ [BTC]: first.at })).did).toBe("placed")
    expect(await grids()).toHaveLength(2)
  })
})

describe("flipping after the opposite side confirms", () => {
  it("closes on one pass and places a fresh opposite grid on the next", async () => {
    const opened = await pass()
    if (opened.did !== "placed") throw new Error("expected a placement")
    now += BAR
    bars = clean("short")

    const closed = await pass({ [BTC]: opened.at })
    expect(closed.did).toBe("closing")
    expect(
      (await grids()).filter((row) => row.status === "active")
    ).toHaveLength(0)

    const flipped = await pass({ [BTC]: opened.at })
    expect(flipped.did).toBe("placed")
    const rows = await grids()
    expect(rows).toHaveLength(2)
    const active = rows.find((row) => row.status === "active")
    expect((active?.plan as GridPlan).direction).toBe("short")
    const [notice] = await database.select().from(customShellAnnouncements)
    expect(notice.title).toBe("The BTC flow grid flipped")
  })

  it("sends a warning when the fresh opposite grid is refused", async () => {
    const opened = await pass()
    if (opened.did !== "placed") throw new Error("expected a placement")
    now += BAR
    bars = clean("short")

    expect((await pass({ [BTC]: opened.at })).did).toBe("closing")
    const refused = await pass(
      { [BTC]: opened.at },
      { strategy: spec(0.01).strategy }
    )

    expect(refused).toMatchObject({ did: "refused", flip: true })
    const [notice] = await database.select().from(customShellAnnouncements)
    expect(notice.title).toBe("The BTC flow grid could not flip")
  })

  it("closes only a held live grid's coins and removes its paired stop", async () => {
    const opened = await pass()
    if (opened.did !== "placed") throw new Error("expected a placement")
    const [row] = await grids()
    const plan = row.plan as GridPlan
    plan.levels[0].status = "holding"
    plan.levels[0].heldSz = plan.levels[0].sz
    plan.pairedStop = {
      orderId: "grid-stop-1",
      px: 80,
      sz: plan.levels[0].sz,
      placedAt: now,
    }
    await database
      .update(tradeSmartLadders)
      .set({ plan })
      .where(eq(tradeSmartLadders.id, row.id))
    wallet = {
      ...wallet,
      label: "Live",
      kind: "live",
      address: "0x1",
      hasKey: true,
    }
    now += BAR
    bars = clean("short")

    expect((await pass({ [BTC]: opened.at })).did).toBe("closing")
    expect(liveRollback).toHaveBeenCalledWith(userId, {
      walletId: "w1",
      marketKey: BTC,
      orderId: "grid-stop-1",
    })
    expect(liveMarketOrder).toHaveBeenCalledWith(userId, {
      walletId: "w1",
      marketKey: BTC,
      side: "sell",
      px: plan.levels[0].buyPx,
      sz: plan.levels[0].sz,
      leverage: plan.leverage,
      reduceOnly: true,
      tpPx: null,
      slPx: null,
      marketOnly: true,
    })
    expect(liveRollback.mock.invocationCallOrder[0]).toBeLessThan(
      liveMarketOrder.mock.invocationCallOrder[0]
    )
    expect((await pass({ [BTC]: opened.at })).did).toBe("placed")
    expect(livePlace).toHaveBeenCalledOnce()
  })

  it("leaves paper coins that the grid does not own", async () => {
    const opened = await pass()
    if (opened.did !== "placed") throw new Error("expected a placement")
    const [row] = await grids()
    const plan = row.plan as GridPlan
    for (const level of plan.levels) level.status = "cancelled"
    plan.levels[0].status = "holding"
    plan.levels[0].heldSz = 1
    mark = plan.levels[0].buyPx
    await database
      .update(tradeSmartLadders)
      .set({ plan })
      .where(eq(tradeSmartLadders.id, row.id))
    await database.insert(tradePaperPositions).values({
      userId,
      id: "paper-position-1",
      walletId: "w1",
      marketKey: BTC,
      szi: 5,
      entryPx: 100,
      leverage: 1,
      maxLeverage: 50,
    })
    now += BAR
    bars = clean("short")

    expect((await pass({ [BTC]: opened.at })).did).toBe("closing")
    expect(paperClose).toHaveBeenCalledWith(userId, wallet, {
      marketKey: BTC,
      side: "sell",
      px: mark,
      sz: 1,
      leverage: 1,
      reduceOnly: true,
      tpPx: null,
      slPx: null,
    })
  })

  it("does not sell a paired ladder after an interrupted Grid close", async () => {
    const opened = await pass()
    if (opened.did !== "placed") throw new Error("expected a placement")
    const [row] = await grids()
    const plan = row.plan as GridPlan
    plan.levels[0].status = "holding"
    plan.levels[0].heldSz = 1
    await database
      .update(tradeSmartLadders)
      .set({ plan })
      .where(eq(tradeSmartLadders.id, row.id))
    pairedPlan.mockResolvedValue({
      rungs: [{ status: "filled", sz: 9 }],
    })
    liveHeld.mockResolvedValue({ szi: 9 })
    wallet = {
      ...wallet,
      label: "Live",
      kind: "live",
      address: "0x1",
      hasKey: true,
    }
    now += BAR
    bars = clean("short")

    expect((await pass({ [BTC]: opened.at })).did).toBe("closing")
    expect(liveMarketOrder).not.toHaveBeenCalled()
    expect(
      (await grids()).find((gridRow) => gridRow.id === row.id)?.status
    ).toBe("done")
  })
})

describe("waiting and refusals", () => {
  it("places custom rung shares whatever they add up to", async () => {
    // Tyler's rule, 1 Sep 2026: the sum is free. Rows adding to 90 place a
    // grid that uses 90% of the pot, not a refusal.
    const runSpec = customRungSpec([10, 20, 30, 30])

    expect((await pass({}, { strategy: runSpec.strategy })).did).toBe("placed")
    const [grid] = await grids()
    expect((grid.plan as GridPlan).manualRungPcts).toEqual([30, 30, 20, 10])
  })

  it("places nothing while the latest candles are mixed", async () => {
    bars = clean("long").map((bar, index) =>
      index >= 582 && index % 2 === 0
        ? { ...bar, open: 89, high: 90, low: 88, close: 89 }
        : bar
    )

    expect(await pass()).toMatchObject({
      did: "waiting",
      code: "EMA_GRID_NONE",
    })
    expect(await grids()).toHaveLength(0)
  })

  it("leaves a running grid open while the latest candles are mixed", async () => {
    await pass()
    bars = clean("long").map((bar, index) =>
      index >= 582 && index % 2 === 0
        ? { ...bar, open: 89, high: 90, low: 88, close: 89 }
        : bar
    )

    expect(await pass()).toMatchObject({
      did: "waiting",
      code: "EMA_GRID_NONE",
    })
    expect(
      (await grids()).filter((row) => row.status === "active")
    ).toHaveLength(1)
  })

  it("names a short candle history and lets exchange failures surface", async () => {
    bars = clean("long").slice(1)
    expect(await pass()).toMatchObject({
      did: "waiting",
      code: "EMA_GRID_HISTORY",
    })

    candleError = new Error("429 Too Many Requests")
    await expect(pass()).rejects.toThrow("429 Too Many Requests")
  })

  it("stores a placement refusal in the run's waiting list", async () => {
    await database.update(tradeFlowRuns).set({ spec: spec(0.01) })
    resetCandlePacing()

    await advanceRunningFlows(now, database)

    const [run] = await database.select().from(tradeFlowRuns)
    expect(run.waiting[BTC]?.code).toMatch(/SMART_GRID|SMART_RUNG/)
    expect(await grids()).toHaveLength(0)
  })

  it("places nothing after Stop has claimed the run", async () => {
    await database
      .update(tradeFlowRuns)
      .set({ status: "stopping" })
      .where(eq(tradeFlowRuns.id, "run-1"))

    expect(await pass()).toMatchObject({
      did: "refused",
      code: "FLOW_NOT_ACCEPTING_PLACEMENTS",
    })
    expect(await grids()).toHaveLength(0)
  })
})
