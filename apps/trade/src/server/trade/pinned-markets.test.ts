import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PGlite } from "@electric-sql/pglite"

import { createTestDatabase, insertUser } from "@/server/test-support"
import type { CustomShellDb } from "@/server/db"
import {
  loadPinnedMarkets,
  savePinnedMarket,
} from "@/server/trade/pinned-markets"

vi.mock("@/server/protocols/market-catalog", () => ({
  loadRawMarketCatalog: vi.fn(async () => ({
    rows: ["BTC", "ETH", "SOL", "DOGE", "AVAX", "XRP"].map((symbol) => ({
      key: `hyperliquid:mainnet:${symbol}`,
    })),
  })),
}))
let client: PGlite
let database: CustomShellDb
beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
})
afterEach(async () => {
  await client.close()
})
const key = (symbol: string) => `hyperliquid:mainnet:${symbol}`

describe("account header pins", () => {
  it("persists ordered pins with no limit and keeps other accounts separate", async () => {
    const user = await insertUser(database)
    const other = await insertUser(database)
    expect(await loadPinnedMarkets(user.id, database)).toEqual([])
    for (const symbol of ["BTC", "ETH", "SOL", "DOGE", "AVAX", "XRP"]) {
      expect(
        (await savePinnedMarket(user.id, key(symbol), true, database)).error
      ).toBeNull()
    }
    expect(await loadPinnedMarkets(user.id, database)).toEqual(
      ["BTC", "ETH", "SOL", "DOGE", "AVAX", "XRP"].map(key)
    )
    expect(await loadPinnedMarkets(other.id, database)).toEqual([])
    await savePinnedMarket(user.id, key("ETH"), false, database)
    expect(await loadPinnedMarkets(user.id, database)).toEqual(
      ["BTC", "SOL", "DOGE", "AVAX", "XRP"].map(key)
    )
    await expect(
      savePinnedMarket(user.id, key("UNKNOWN"), true, database)
    ).rejects.toThrow("no longer listed")
  })
})
