import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  MarketCatalog,
  MarketRow,
  NetworkId,
  ProtocolId,
} from "@/lib/protocols/contracts"
import { marketKey } from "@/lib/protocols/contracts"
import { encryptSecret } from "@/server/auth/encryption"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { tradeLeverageCeilings, tradeWallets } from "@/server/trade/schema"

const { readCeilings, publicRules } = vi.hoisted(() => ({
  readCeilings: vi.fn(),
  publicRules: vi.fn(),
}))
// Only Aster reads ceilings with keys; every other exchange states them.
vi.mock("@/server/protocols/registry", () => ({
  getProtocol: (id: ProtocolId) => ({
    account: { aster: { leverageCeilings: readCeilings } }[id as string] ?? {},
  }),
}))
vi.mock("@/server/trade/market-rules", () => ({ marketRules: publicRules }))

import {
  clearLeverageCeilingState,
  userMarketRules,
  withLeverageCeilings,
} from "@/server/trade/leverage-ceilings"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "a test-only secret"
  clearLeverageCeilingState()
  readCeilings.mockReset()
  publicRules.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await client.close()
})

async function wallet(
  userId: string,
  overrides: Partial<typeof tradeWallets.$inferInsert> = {}
) {
  const id = crypto.randomUUID()
  await database.insert(tradeWallets).values({
    id,
    userId,
    label: "Aster live",
    kind: "live",
    protocol: "aster",
    network: "mainnet",
    startingBalance: 100,
    address: "0x1234567890abcdef1234567890abcdef12345678",
    agentKeyEncrypted: encryptSecret("aster-api-key"),
    ...overrides,
  })
  return id
}

function row(
  protocol: ProtocolId,
  marketId: string,
  maxLeverage: number | null
): MarketRow {
  return {
    key: marketKey({ protocol, network: "mainnet", marketId }),
    marketId,
    symbol: marketId,
    quoteAsset: "USDT",
    subExchange: null,
    category: "crypto",
    sizeDecimals: 3,
    priceTick: 0.1,
    minOrderValueUsd: 5,
    maxLeverage,
    isolatedOnly: false,
    iconUrl: null,
    price: 100,
    change24h: null,
    volume24hUsd: 1_000_000,
    fundingHourly: null,
    openInterestUsd: null,
  }
}

function catalog(
  protocol: ProtocolId,
  rows: MarketRow[],
  network: NetworkId = "mainnet"
): MarketCatalog {
  return {
    protocol,
    protocolLabel: protocol,
    network,
    networkLabel: "Mainnet",
    picker: {
      categories: "catalog",
      hip3: false,
      funding: true,
      openInterest: false,
    },
    rows,
  }
}

const asterMarkets = () =>
  catalog("aster", [row("aster", "BTCUSDT", null), row("aster", "ETHUSDT", 20)])

describe("leverage ceilings on the market list", () => {
  it("fills an unknown ceiling from the wallet's own keys and keeps a stated one", async () => {
    const user = await insertUser(database)
    await wallet(user.id)
    readCeilings.mockResolvedValue(
      new Map([
        ["BTCUSDT", 125],
        ["ETHUSDT", 100],
      ])
    )
    const before = asterMarkets()

    const after = await withLeverageCeilings(user.id, before)

    expect(after.rows.map((one) => one.maxLeverage)).toEqual([125, 20])
    expect(readCeilings).toHaveBeenCalledWith(
      "mainnet",
      "0x1234567890abcdef1234567890abcdef12345678",
      expect.any(Function)
    )
    expect(readCeilings.mock.calls[0][2]()).toBe("aster-api-key")
    // The shared catalogue other people read is left as it was.
    expect(before.rows[0].maxLeverage).toBeNull()
  })

  it("makes no signed call without a switched-on keyed wallet", async () => {
    const user = await insertUser(database)
    await wallet(user.id, {
      kind: "paper",
      address: null,
      agentKeyEncrypted: null,
    })
    await wallet(user.id, { status: "inactive" })
    await wallet(user.id, { network: "testnet" })
    const markets = asterMarkets()

    expect(await withLeverageCeilings(user.id, markets)).toBe(markets)
    expect(readCeilings).not.toHaveBeenCalled()
  })

  it("never uses another person's wallet", async () => {
    const owner = await insertUser(database)
    const stranger = await insertUser(database)
    await wallet(owner.id)
    readCeilings.mockResolvedValue(new Map([["BTCUSDT", 125]]))
    await withLeverageCeilings(owner.id, asterMarkets())

    const seen = await withLeverageCeilings(stranger.id, asterMarkets())

    expect(seen.rows[0].maxLeverage).toBeNull()
    expect(readCeilings).toHaveBeenCalledTimes(1)
  })

  it("asks once a day, and a restart reads the stored answer", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-23T08:00:00Z"))
    const user = await insertUser(database)
    const walletId = await wallet(user.id)
    readCeilings.mockResolvedValue(new Map([["BTCUSDT", 125]]))

    await withLeverageCeilings(user.id, asterMarkets())
    await withLeverageCeilings(user.id, asterMarkets())
    // Memory gone, as after a restart: the database still answers.
    clearLeverageCeilingState()
    vi.setSystemTime(new Date("2026-09-24T07:59:00Z"))
    const later = await withLeverageCeilings(user.id, asterMarkets())

    expect(later.rows[0].maxLeverage).toBe(125)
    expect(readCeilings).toHaveBeenCalledTimes(1)
    const stored = await database.select().from(tradeLeverageCeilings)
    expect(stored).toEqual([
      expect.objectContaining({
        walletId,
        ceilings: { BTCUSDT: 125 },
      }),
    ])

    vi.setSystemTime(new Date("2026-09-24T08:01:00Z"))
    readCeilings.mockResolvedValue(new Map([["BTCUSDT", 100]]))
    const nextDay = await withLeverageCeilings(user.id, asterMarkets())

    expect(nextDay.rows[0].maxLeverage).toBe(100)
    expect(readCeilings).toHaveBeenCalledTimes(2)
  })

  it("shares one read between two screens opening at once", async () => {
    const user = await insertUser(database)
    await wallet(user.id)
    readCeilings.mockResolvedValue(new Map([["BTCUSDT", 125]]))

    await Promise.all([
      withLeverageCeilings(user.id, asterMarkets()),
      withLeverageCeilings(user.id, asterMarkets()),
    ])

    expect(readCeilings).toHaveBeenCalledTimes(1)
  })

  it("leaves the list alone after a refusal and does not ask again straight away", async () => {
    const user = await insertUser(database)
    await wallet(user.id)
    readCeilings.mockRejectedValue(new Error("ASTER_KEY_REJECTED"))
    const markets = asterMarkets()

    expect(await withLeverageCeilings(user.id, markets)).toBe(markets)
    expect(await withLeverageCeilings(user.id, markets)).toBe(markets)
    expect(readCeilings).toHaveBeenCalledTimes(1)
    expect(await database.select().from(tradeLeverageCeilings)).toEqual([])
  })

  it("keeps yesterday's answer when today's read fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-23T08:00:00Z"))
    const user = await insertUser(database)
    await wallet(user.id)
    readCeilings.mockResolvedValueOnce(new Map([["BTCUSDT", 125]]))
    await withLeverageCeilings(user.id, asterMarkets())

    vi.setSystemTime(new Date("2026-09-25T08:00:00Z"))
    readCeilings.mockRejectedValueOnce(new Error("EXCHANGE_BUSY"))
    const after = await withLeverageCeilings(user.id, asterMarkets())

    expect(after.rows[0].maxLeverage).toBe(125)
  })

  it("does not store an empty answer that would hide the slider for a day", async () => {
    const user = await insertUser(database)
    await wallet(user.id)
    readCeilings.mockResolvedValue(new Map())

    const after = await withLeverageCeilings(user.id, asterMarkets())

    expect(after.rows[0].maxLeverage).toBeNull()
    expect(await database.select().from(tradeLeverageCeilings)).toEqual([])
  })

  it("does not touch an exchange that states its ceilings publicly", async () => {
    const user = await insertUser(database)
    await wallet(user.id, { protocol: "hyperliquid" })
    const hyperliquid = catalog("hyperliquid", [
      row("hyperliquid", "BTC", 40),
      row("hyperliquid", "NEW", null),
    ])

    expect(await withLeverageCeilings(user.id, hyperliquid)).toBe(hyperliquid)
    expect(readCeilings).not.toHaveBeenCalled()
  })
})

describe("leverage ceilings on an order", () => {
  const rules = {
    sizeDecimals: 3,
    priceTick: 0.1,
    maxLeverage: null,
    volume24hUsd: 1_000_000,
  }

  it("uses the stored ceiling and never makes a signed read", async () => {
    const user = await insertUser(database)
    await wallet(user.id)
    readCeilings.mockResolvedValue(new Map([["BTCUSDT", 125]]))
    await withLeverageCeilings(user.id, asterMarkets())
    readCeilings.mockClear()
    publicRules.mockResolvedValue(rules)

    const answer = await userMarketRules(user.id, "aster", "mainnet", "BTCUSDT")

    expect(answer?.maxLeverage).toBe(125)
    expect(readCeilings).not.toHaveBeenCalled()
  })

  it("stays unknown when nothing has been stored", async () => {
    const user = await insertUser(database)
    await wallet(user.id)
    publicRules.mockResolvedValue(rules)

    const answer = await userMarketRules(user.id, "aster", "mainnet", "BTCUSDT")

    expect(answer?.maxLeverage).toBeNull()
    expect(readCeilings).not.toHaveBeenCalled()
  })
})
