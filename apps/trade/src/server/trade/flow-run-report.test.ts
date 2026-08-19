import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { defaultDcaParams } from "@/lib/trade/dca"
import type { TradeFlowRunSpec } from "@/lib/trade/flow-run"
import type { TradeWallet } from "@/lib/trade/wallets"
import type { CustomShellDb } from "@/server/db"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { customShellAutomations } from "@/server/schema"
import {
  tradeFlowRunOrders,
  tradeFlowRuns,
  tradePaperJournal,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

/**
 * What the live-run dashboard reads.
 *
 * The case that matters is the last one: a trade placed by hand on the same
 * wallet, on the same coin, while the flow was running. Every figure on that
 * page is wrong if it lands in the run's trades, and no amount of care in the
 * browser can fix it afterwards.
 */

const NOW = 1_700_000_000_000

/** Enough of a ladder plan for `readSmartPlan` to hand one back. */
const LADDER_PLAN = {
  anchorPx: 100,
  anchor: "base",
  rungEntry: "market",
  startedAt: NOW,
  sizeDecimals: 3,
  maxLeverage: 1,
  leverage: 1,
  rungs: [
    {
      px: 95,
      sz: 1,
      status: "waiting",
      budget: 95,
      orderId: null,
      sellOrderId: null,
      dead: false,
      touched: false,
    },
  ],
  takeProfit: null,
  stopLoss: null,
  aimedTpPx: null,
  aimedSlPx: null,
  twoGreen: false,
  greenInterval: null,
  green: null,
} as never

const BTC = "hyperliquid:mainnet:BTC"
const ETH = "hyperliquid:mainnet:ETH"
/** A coin this run does not watch. */
const OTHER = "hyperliquid:mainnet:SOL"

let client: PGlite
let db: CustomShellDb
let userId: string

const wallet: TradeWallet = {
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

// The run's own wallet, without the exchange. The report is about rows that
// are already written down; what a position is worth today is the trading
// screen's business and is tested where that lives.
vi.mock("@/server/trade/wallets", () => ({
  listWallets: async () => [wallet],
  findWallet: async () => wallet,
}))

const { deleteFlowRuns, listFlowRuns, readFlowRun, readFlowRunCoin } =
  await import("@/server/trade/flow-run-report")

function spec(patch: Partial<TradeFlowRunSpec> = {}): TradeFlowRunSpec {
  return {
    protocol: "hyperliquid",
    network: "mainnet",
    marketKeys: [BTC, ETH],
    strategy: { kind: "dca", params: defaultDcaParams(), interval: "4h" },
    capUsd: 500,
    walletLabel: "Practice",
    real: false,
    ...patch,
  }
}

/** A buy and a sell on one coin, through one order id each. */
async function roundTrip(input: {
  marketKey: string
  openOrderId: string
  closeOrderId: string
  at: number
  pnl: number
}) {
  await db.insert(tradePaperJournal).values([
    {
      userId,
      id: `${input.openOrderId}-fill`,
      walletId: "w1",
      marketKey: input.marketKey,
      side: "buy",
      px: 100,
      sz: 1,
      fee: 0,
      closedPnl: 0,
      reason: "order",
      fillTime: new Date(input.at),
      orderId: input.openOrderId,
    },
    {
      userId,
      id: `${input.closeOrderId}-fill`,
      walletId: "w1",
      marketKey: input.marketKey,
      side: "sell",
      px: 100 + input.pnl,
      sz: 1,
      fee: 0,
      closedPnl: input.pnl,
      reason: "order",
      fillTime: new Date(input.at + 60_000),
      orderId: input.closeOrderId,
    },
  ])
}

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  userId = (await insertUser(db)).id
  const workspace = await insertWorkspace(db)

  await db.insert(customShellAutomations).values({
    id: "flow-1",
    userId,
    workspaceId: workspace.id,
    name: "Ladder every coin",
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

  await db.insert(tradeFlowRuns).values({
    userId,
    id: "run-1",
    walletId: "w1",
    automationId: "flow-1",
    // Stopped, so the report reads what is written down and asks the exchange
    // nothing — which is exactly what a test of the arithmetic wants.
    status: "stopped",
    spec: spec(),
    placed: [BTC],
    waiting: { [ETH]: { code: "SMART_LADDER_NO_BASE", at: NOW } },
    startedAt: new Date(NOW),
    stoppedAt: new Date(NOW + 3_600_000),
    updatedAt: new Date(NOW),
  })

  await db.insert(tradeSmartLadders).values([
    {
      userId,
      id: "ladder-1",
      walletId: "w1",
      marketKey: BTC,
      kind: "dca",
      status: "done",
      plan: {} as never,
      flowRunId: "run-1",
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    },
    // Placed by hand on the same wallet and the same coin.
    {
      userId,
      id: "ladder-2",
      walletId: "w1",
      marketKey: BTC,
      kind: "dca",
      status: "done",
      plan: {} as never,
      flowRunId: null,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    },
  ])

  await db.insert(tradeFlowRunOrders).values([
    {
      userId,
      walletId: "w1",
      orderId: "flow-open",
      flowRunId: "run-1",
      ladderId: "ladder-1",
      marketKey: BTC,
    },
  ])
})

afterEach(async () => {
  await client.close()
})

describe("readFlowRun", () => {
  it("counts the run's own trade and leaves the hand trade out", async () => {
    await roundTrip({
      marketKey: BTC,
      openOrderId: "flow-open",
      closeOrderId: "flow-close",
      at: NOW + 60_000,
      pnl: 25,
    })
    await roundTrip({
      marketKey: BTC,
      openOrderId: "by-hand-open",
      closeOrderId: "by-hand-close",
      at: NOW + 600_000,
      pnl: 500,
    })

    const report = await readFlowRun(userId, "run-1", NOW + 7_200_000)
    expect(report).not.toBeNull()
    expect(report!.trades).toHaveLength(1)
    expect(report!.trades[0].pnl).toBe(25)
    // Said out loud rather than hidden.
    expect(report!.notMine).toBe(1)
  })

  it("counts a coin as working off the wallet, not off the stamp", async () => {
    // The ladder here has no stamp — placed before the stamp existed. The run
    // is still working that coin, and a dashboard reading "0 working" beside a
    // ladder plainly at work is the version that gets believed and is wrong.
    await db
      .update(tradeSmartLadders)
      .set({ status: "active" })
      .where(eq(tradeSmartLadders.id, "ladder-2"))
    await db
      .update(tradeFlowRuns)
      .set({ status: "running", stoppedAt: null })
      .where(eq(tradeFlowRuns.id, "run-1"))

    const report = await readFlowRun(userId, "run-1", NOW + 7_200_000)
    expect(report!.head.working).toBe(1)
    expect(report!.coins.find((coin) => coin.marketKey === BTC)?.working).toBe(
      true
    )
  })

  it("says in words what each coin is waiting on", async () => {
    const report = await readFlowRun(userId, "run-1", NOW + 7_200_000)
    const eth = report!.coins.find((coin) => coin.marketKey === ETH)
    expect(eth?.words).toBe("Waiting for a base to form")
    expect(eth?.problem).toBe(false)
  })

  it("is nobody else's to read", async () => {
    const stranger = await insertUser(db)
    expect(await readFlowRun(stranger.id, "run-1")).toBeNull()
  })
})

describe("readFlowRunCoin", () => {
  it("draws the rungs working on a coin this run watches", async () => {
    // Read off the wallet and the coin list, not off the stamp — the same rule
    // the canvas chip uses for "what is this flow working on". A ladder placed
    // before the stamp existed still draws, which is the whole point.
    await db
      .update(tradeSmartLadders)
      .set({ status: "active", plan: LADDER_PLAN })
      .where(eq(tradeSmartLadders.id, "ladder-2"))

    const coin = await readFlowRunCoin(userId, "run-1", BTC)
    expect(coin!.ladders.map((one) => one.id)).toEqual(["ladder-2"])
  })

  it("draws nothing for a coin outside the run's list", async () => {
    await db
      .update(tradeSmartLadders)
      .set({ status: "active", plan: LADDER_PLAN, marketKey: OTHER })
      .where(eq(tradeSmartLadders.id, "ladder-2"))

    const coin = await readFlowRunCoin(userId, "run-1", OTHER)
    expect(coin!.ladders).toHaveLength(0)
    expect(coin!.marks).toHaveLength(0)
  })
})

describe("deleting a run", () => {
  it("takes the run and the orders it sent, and leaves the ladders' stamp", async () => {
    const { deleted } = await deleteFlowRuns(userId, ["run-1"])
    expect(deleted).toEqual(["run-1"])

    expect(
      await db.select().from(tradeFlowRuns).where(eq(tradeFlowRuns.id, "run-1"))
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(tradeFlowRunOrders)
        .where(eq(tradeFlowRunOrders.flowRunId, "run-1"))
    ).toHaveLength(0)
    // The ladder still says who placed it. That is a fact about the past, and
    // tidying the run away does not make it untrue.
    const [ladder] = await db
      .select()
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.id, "ladder-1"))
    expect(ladder.flowRunId).toBe("run-1")
  })

  it("refuses to delete a run that is still switched on", async () => {
    await db
      .update(tradeFlowRuns)
      .set({ status: "running" })
      .where(eq(tradeFlowRuns.id, "run-1"))

    const { deleted } = await deleteFlowRuns(userId, ["run-1"])
    expect(deleted).toEqual([])
    expect(
      await db.select().from(tradeFlowRuns).where(eq(tradeFlowRuns.id, "run-1"))
    ).toHaveLength(1)
  })

  it("is nobody else's to delete", async () => {
    const stranger = await insertUser(db)
    const { deleted } = await deleteFlowRuns(stranger.id, ["run-1"])
    expect(deleted).toEqual([])
    expect(
      await db.select().from(tradeFlowRuns).where(eq(tradeFlowRuns.id, "run-1"))
    ).toHaveLength(1)
  })
})

describe("listFlowRuns", () => {
  it("adds up only what each run banked", async () => {
    await roundTrip({
      marketKey: BTC,
      openOrderId: "flow-open",
      closeOrderId: "flow-close",
      at: NOW + 60_000,
      pnl: 25,
    })
    await roundTrip({
      marketKey: BTC,
      openOrderId: "by-hand-open",
      closeOrderId: "by-hand-close",
      at: NOW + 600_000,
      pnl: 500,
    })

    const rows = await listFlowRuns(userId, NOW + 7_200_000)
    expect(rows).toHaveLength(1)
    expect(rows[0].netUsd).toBe(25)
    expect(rows[0].tradesClosed).toBe(1)
    expect(rows[0].automationName).toBe("Ladder every coin")
  })
})
