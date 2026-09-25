import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { WalletOrderFill } from "@/lib/protocols/contracts"
import type { WatchPlan } from "@/lib/trade/watch-order"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  tradeCopies,
  tradeCopyLegs,
  tradeCopyNotes,
  tradeCopyOrders,
  tradePublicProfiles,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

/** What the trader's exchange account holds after the trade, by market. */
let traderHeld: Array<{ marketKey: string; szi: number; leverage: number }> = []
/** What the copier's practice wallet holds, by market. */
let copierHeld = new Map<string, { szi: number; entryPx: number }>()
let mark = 180

const openPartClose = vi.fn()
const writeTradeNotice = vi.fn()

vi.mock("@/server/trade/live-orders", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  liveHeldPositions: async () =>
    traderHeld.map((one) => ({
      marketKey: one.marketKey,
      held: {
        marketId: one.marketKey.split(":")[2],
        szi: one.szi,
        leverage: one.leverage,
        entryPx: 180,
      },
    })),
}))

vi.mock("@/server/trade/paper", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  settleWallet: async () => ({ positions: copierHeld }),
}))

vi.mock("@/server/trade/part-close", () => ({ openPartClose }))

vi.mock("@/server/trade/notices", () => ({ writeTradeNotice }))

vi.mock("@/server/trade/leverage-ceilings", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  userMarketRules: async () => ({
    sizeDecimals: 2,
    minOrderSize: null,
    priceTick: null,
    minOrderValueUsd: 10,
    maxLeverage: 20,
    volume24hUsd: 500_000_000,
  }),
}))

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    id: "hyperliquid",
    label: "Hyperliquid",
    markets: {
      prices: async (_network: string, ids: string[]) =>
        new Map(ids.map((id) => [id, mark])),
    },
    orders: {},
  }),
}))

vi.mock("@/server/trade/public-profiles", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPublicProfileView: async () => ({ onLeaderboard: true }),
}))

const { copyFreshLiveFills } = await import("@/server/trade/copy-engine")
const { recordCopiedFills } = await import("@/server/trade/copy-ledger")
const { loadMyCopiers } = await import("@/server/trade/copy-trading")
const { findWallet } = await import("@/server/trade/wallets")

const SOL = "hyperliquid:mainnet:SOL"

let client: PGlite
let database: CustomShellDb
let trader: string
let copier: string
let copyId: string

function fill(
  side: "buy" | "sell",
  sz: number,
  dir: string,
  extra: Partial<WalletOrderFill> = {}
): WalletOrderFill {
  return {
    fillId: `f-${Math.random()}`,
    orderId: `o-${Math.random()}`,
    marketId: "SOL",
    side,
    px: 180,
    sz,
    at: Date.now(),
    closedPnl: 0,
    fee: 0,
    dir,
    liquidation: false,
    ...extra,
  }
}

async function traderTrades(fills: WalletOrderFill[]) {
  const wallet = await findWallet(trader, "trader-wallet")
  await copyFreshLiveFills(trader, wallet!, fills)
}

async function copyWatches(): Promise<WatchPlan[]> {
  const rows = await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, copier))
  return rows.map((row) => row.plan as WatchPlan)
}

async function notes(): Promise<string[]> {
  const rows = await database
    .select()
    .from(tradeCopyNotes)
    .where(eq(tradeCopyNotes.userId, copier))
  return rows.map((row) => row.note)
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  traderHeld = []
  copierHeld = new Map()
  mark = 180
  openPartClose.mockReset()
  openPartClose.mockResolvedValue({ kind: "chasing", sz: 0, px: 180 })
  writeTradeNotice.mockReset()
  writeTradeNotice.mockResolvedValue(undefined)

  trader = (await insertUser(database)).id
  copier = (await insertUser(database)).id
  await database.insert(tradePublicProfiles).values({
    userId: trader,
    handle: "sam",
    displayName: "Sam",
    enabled: true,
    allowCopying: true,
  })
  await database.insert(tradeWallets).values([
    {
      userId: trader,
      id: "trader-wallet",
      label: "Sam real",
      kind: "live",
      protocol: "hyperliquid",
      network: "mainnet",
      startingBalance: 5_000,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    },
    {
      userId: copier,
      id: "copier-wallet",
      label: "Practice",
      kind: "paper",
      protocol: "hyperliquid",
      network: "mainnet",
      startingBalance: 10_000,
    },
  ])
  copyId = "copy-1"
  await database.insert(tradeCopies).values({
    id: copyId,
    copierUserId: copier,
    copierWalletId: "copier-wallet",
    traderUserId: trader,
    traderWalletId: "trader-wallet",
    protocol: "hyperliquid",
    dollarsPerTrade: 200,
    maxOpenUsd: 1_000,
    maxLeverage: 5,
    coins: null,
    priceAllowance: 0.01,
    lossLimitUsd: null,
    status: "active",
    createdAt: new Date(Date.now() - 60_000),
  })
})

afterEach(async () => {
  await client.close()
})

describe("a practice wallet copying a real trader", () => {
  it("places the same trade, scaled to the copier's dollars per trade", async () => {
    // Sam buys 27.7 SOL at $180, about $5,000, at 3x. Alex copies with $200.
    traderHeld = [{ marketKey: SOL, szi: 27.7, leverage: 3 }]
    await traderTrades([fill("buy", 27.7, "Open Long")])

    const [plan] = await copyWatches()
    expect(plan).toMatchObject({
      copyId,
      side: "buy",
      // $200 at $180 is 1.111 SOL, floored to the market's two decimals.
      sz: 1.11,
      leverage: 3,
      maker: true,
      reduceOnly: false,
      chaseGiveUp: 0.01,
      triggerPx: 180,
      phase: "taking",
    })
    const [leg] = await database
      .select()
      .from(tradeCopyLegs)
      .where(eq(tradeCopyLegs.copyId, copyId))
    expect(leg).toMatchObject({ marketKey: SOL, traderSz: 27.7 })
  })

  it("closes the same share when the trader closes part", async () => {
    await database
      .insert(tradeCopyLegs)
      .values({ copyId, marketKey: SOL, traderSz: 27.7 })
    copierHeld = new Map([[SOL, { szi: 1.11, entryPx: 180 }]])
    // Sam sells 11.08 of 27.7 SOL: 40 out of every 100.
    traderHeld = [{ marketKey: SOL, szi: 16.62, leverage: 3 }]
    await traderTrades([fill("sell", 11.08, "Close Long", { px: 198 })])

    expect(openPartClose).toHaveBeenCalledTimes(1)
    const [userId, wallet, input] = openPartClose.mock.calls[0]
    expect(userId).toBe(copier)
    expect(wallet.id).toBe("copier-wallet")
    expect(input).toMatchObject({ marketKey: SOL, how: "limit", copyId })
    expect(input.size.unit).toBe("coins")
    expect(input.size.amount).toBeCloseTo(1.11 * 0.4, 6)
  })

  it("closes all of it when the trader's stop sells everything", async () => {
    await database
      .insert(tradeCopyLegs)
      .values({ copyId, marketKey: SOL, traderSz: 27.7 })
    copierHeld = new Map([[SOL, { szi: 1.11, entryPx: 180 }]])
    traderHeld = []
    await traderTrades([fill("sell", 27.7, "Close Long", { px: 170 })])

    expect(openPartClose.mock.calls[0][2]).toMatchObject({
      size: { unit: "all" },
      how: "limit",
    })
    const legs = await database
      .select()
      .from(tradeCopyLegs)
      .where(eq(tradeCopyLegs.copyId, copyId))
    expect(legs).toEqual([])
  })

  it("calls off its own unfinished buying, paused or not, when the trader closes", async () => {
    traderHeld = [{ marketKey: SOL, szi: 27.7, leverage: 3 }]
    await traderTrades([fill("buy", 27.7, "Open Long")])
    // The chase was refused five times in a row and paused itself.
    const [row] = await database
      .select()
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.userId, copier))
    await database
      .update(tradeSmartLadders)
      .set({
        plan: { ...(row.plan as WatchPlan), paused: true, pauseReason: "Refused" },
      })
      .where(eq(tradeSmartLadders.id, row.id))

    traderHeld = []
    await traderTrades([fill("sell", 27.7, "Close Long")])

    const [plan] = await copyWatches()
    expect(plan).toMatchObject({ phase: "stopping", paused: false })
    // Nothing was bought yet, so there was nothing to sell.
    expect(openPartClose).not.toHaveBeenCalled()
  })

  it("skips a copy that would break the copier's cap, and says so in the Journal", async () => {
    await database
      .update(tradeCopies)
      .set({ maxOpenUsd: 300 })
      .where(eq(tradeCopies.id, copyId))
    await database
      .insert(tradeCopyLegs)
      .values({ copyId, marketKey: SOL, traderSz: 27.7 })
    copierHeld = new Map([[SOL, { szi: 1.11, entryPx: 180 }]])
    traderHeld = [{ marketKey: SOL, szi: 37.7, leverage: 3 }]
    await traderTrades([fill("buy", 10, "Open Long")])

    expect(await copyWatches()).toEqual([])
    expect(await notes()).toEqual([
      "This copy would bring your copied positions to $400, above your $300 limit.",
    ])
    // The trader's size is still followed, so a later sale measures right.
    const [leg] = await database
      .select()
      .from(tradeCopyLegs)
      .where(eq(tradeCopyLegs.copyId, copyId))
    expect(leg.traderSz).toBe(37.7)
  })

  it("skips a copy when the price already moved past the allowance", async () => {
    mark = 183
    traderHeld = [{ marketKey: SOL, szi: 27.7, leverage: 3 }]
    await traderTrades([fill("buy", 27.7, "Open Long")])

    expect(await copyWatches()).toEqual([])
    expect(await notes()).toEqual([
      "SOL moved from $180 to $183 before the copy could start, more than the $1 in every $100 you allow.",
    ])
  })

  it("skips a trader's leverage above what the copier accepts", async () => {
    traderHeld = [{ marketKey: SOL, szi: 27.7, leverage: 10 }]
    await traderTrades([fill("buy", 27.7, "Open Long")])

    expect(await copyWatches()).toEqual([])
    expect(await notes()).toEqual(["@sam used 10x, above the 5x you accept."])
  })

  it("pauses without closing anything when the trader's profile goes private", async () => {
    await database
      .update(tradePublicProfiles)
      .set({ enabled: false })
      .where(eq(tradePublicProfiles.userId, trader))
    copierHeld = new Map([[SOL, { szi: 1.11, entryPx: 180 }]])
    traderHeld = []
    await traderTrades([fill("sell", 27.7, "Close Long")])

    const [copy] = await database
      .select()
      .from(tradeCopies)
      .where(eq(tradeCopies.id, copyId))
    expect(copy).toMatchObject({ status: "paused", pausedReason: "trader-private" })
    expect(openPartClose).not.toHaveBeenCalled()
    expect(writeTradeNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: copier,
        title: "Copying @sam paused",
      })
    )
  })
})

describe("the fee record", () => {
  it("writes one row per copied fill, and the rows add up to what the trader is owed", async () => {
    await database.insert(tradeWallets).values({
      userId: copier,
      id: "copier-real",
      label: "Real",
      kind: "live",
      protocol: "hyperliquid",
      network: "mainnet",
      startingBalance: 1_000,
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    })
    await database.insert(tradeCopyOrders).values([
      { userId: copier, walletId: "copier-real", orderId: "open", copyId, marketKey: SOL },
      { userId: copier, walletId: "copier-real", orderId: "close", copyId, marketKey: SOL },
      { userId: copier, walletId: "copier-wallet", orderId: "practice", copyId, marketKey: SOL },
    ])
    const real = { id: "copier-real", kind: "live" as const, protocol: "hyperliquid" as const }
    const practice = { id: "copier-wallet", kind: "paper" as const, protocol: "hyperliquid" as const }
    const base = { marketKey: SOL, closedPnl: 0, fee: 0, at: Date.now() }
    // $200 in at $180 and $219.80 out at $198: the task's worked example.
    await recordCopiedFills(database, copier, real, [
      { ...base, fillId: "a", orderId: "open", side: "buy", px: 180, sz: 200 / 180 },
      { ...base, fillId: "b", orderId: "close", side: "sell", px: 198, sz: 200 / 180, closedPnl: 20 },
      // A fill of the copier's own order is not a copy and gets no row.
      { ...base, fillId: "c", orderId: "by-hand", side: "buy", px: 180, sz: 1 },
    ])
    // Repeating the same fills changes nothing.
    await recordCopiedFills(database, copier, real, [
      { ...base, fillId: "a", orderId: "open", side: "buy", px: 180, sz: 200 / 180 },
    ])
    await recordCopiedFills(database, copier, practice, [
      { ...base, fillId: "p", orderId: "practice", side: "buy", px: 180, sz: 1 },
    ])

    const mine = await loadMyCopiers(trader)
    // Trade collects $0.20 + $0.22 = $0.42; half of it is the trader's.
    expect(mine?.owedUsd).toBeCloseTo((200 + 220) * 0.001 * 0.5, 6)
    expect(mine?.paidUsd).toBe(0)
  })
})

describe("the builder fee a copied order carries", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is Trade's address at 0.1% once the address is set, and nothing before", async () => {
    const { copyBuilderFee, forgetCopyConfig } = await import(
      "@/server/trade/copy-ledger"
    )
    forgetCopyConfig()
    vi.stubEnv("TRADE_BUILDER_ADDRESS", "")
    expect(await copyBuilderFee()).toBeNull()
    vi.stubEnv(
      "TRADE_BUILDER_ADDRESS",
      "0x9999999999999999999999999999999999999999"
    )
    expect(await copyBuilderFee()).toEqual({
      address: "0x9999999999999999999999999999999999999999",
      tenthsBps: 100,
    })
  })
})
