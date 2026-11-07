import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EXCHANGE_PAGE_MARKET } from "@/lib/trade/trade-pages"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  loadTradePage,
  PAGE_LOCKED_MESSAGE,
  saveTradePage,
  setTradePageCover,
  setTradePageLocked,
} from "@/server/trade/pages"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

const btc = "hyperliquid:mainnet:BTC"

function page(...content: unknown[]) {
  return JSON.stringify({ type: "doc", content })
}

const words = {
  type: "paragraph",
  content: [{ type: "text", text: "Watch the funding." }],
}

describe("the dashboard's pages", () => {
  it("has no page until one is written, so the starting page shows", async () => {
    const { id } = await insertUser(database)
    expect(
      await loadTradePage(id, "hyperliquid", EXCHANGE_PAGE_MARKET, database)
    ).toEqual({ body: null, locked: false, coverUrl: null })
  })

  it("keeps the exchange's page and each market's page apart", async () => {
    const { id } = await insertUser(database)
    await saveTradePage(
      id,
      "hyperliquid",
      EXCHANGE_PAGE_MARKET,
      page({ type: "noteRules" }, words),
      database
    )
    await saveTradePage(
      id,
      "hyperliquid",
      btc,
      page({ type: "noteMarketInfo" }),
      database
    )

    const exchange = await loadTradePage(
      id,
      "hyperliquid",
      EXCHANGE_PAGE_MARKET,
      database
    )
    const market = await loadTradePage(id, "hyperliquid", btc, database)
    expect(JSON.parse(exchange.body!).content[0]).toEqual({ type: "noteRules" })
    expect(JSON.parse(market.body!).content).toEqual([
      { type: "noteMarketInfo" },
    ])
    // Another exchange's page is its own.
    expect(
      (await loadTradePage(id, "phemex", EXCHANGE_PAGE_MARKET, database)).body
    ).toBeNull()
  })

  it("drops a block saved onto the wrong page", async () => {
    const { id } = await insertUser(database)
    await saveTradePage(
      id,
      "hyperliquid",
      btc,
      page({ type: "noteRules" }, { type: "noteMarketInfo" }),
      database
    )
    const market = await loadTradePage(id, "hyperliquid", btc, database)
    expect(JSON.parse(market.body!).content).toEqual([
      { type: "noteMarketInfo" },
    ])
  })

  it("refuses a save while the page is locked, and takes one again once unlocked", async () => {
    const { id } = await insertUser(database)
    const shown = page({ type: "noteRules" })
    await setTradePageLocked(
      id,
      "hyperliquid",
      EXCHANGE_PAGE_MARKET,
      true,
      shown,
      database
    )
    // Locking a page never written keeps what it showed.
    expect(
      await loadTradePage(id, "hyperliquid", EXCHANGE_PAGE_MARKET, database)
    ).toEqual({ body: shown, locked: true, coverUrl: null })
    await expect(
      saveTradePage(
        id,
        "hyperliquid",
        EXCHANGE_PAGE_MARKET,
        page(words),
        database
      )
    ).rejects.toThrow(PAGE_LOCKED_MESSAGE)

    await setTradePageLocked(
      id,
      "hyperliquid",
      EXCHANGE_PAGE_MARKET,
      false,
      page(words),
      database
    )
    // Unlocking leaves the words that were there.
    expect(
      (await loadTradePage(id, "hyperliquid", EXCHANGE_PAGE_MARKET, database))
        .body
    ).toBe(shown)
    await saveTradePage(
      id,
      "hyperliquid",
      EXCHANGE_PAGE_MARKET,
      page(words),
      database
    )
    expect(
      (await loadTradePage(id, "hyperliquid", EXCHANGE_PAGE_MARKET, database))
        .body
    ).toBe(page(words))
  })

  it("keeps a cover photo with the page and clears it again", async () => {
    const { id } = await insertUser(database)
    const shown = page({ type: "noteMarketInfo" })
    await setTradePageCover(
      id,
      "hyperliquid",
      btc,
      "https://example.com/cover.jpg",
      shown,
      database
    )
    expect(await loadTradePage(id, "hyperliquid", btc, database)).toEqual({
      body: shown,
      locked: false,
      coverUrl: "https://example.com/cover.jpg",
    })
    await setTradePageCover(id, "hyperliquid", btc, null, page(words), database)
    // Clearing the cover leaves the page's words as they were.
    expect(await loadTradePage(id, "hyperliquid", btc, database)).toEqual({
      body: shown,
      locked: false,
      coverUrl: null,
    })
  })

  it("keeps one person's page away from another's", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)
    await saveTradePage(
      theirs.id,
      "hyperliquid",
      EXCHANGE_PAGE_MARKET,
      page(words),
      database
    )
    expect(
      (
        await loadTradePage(
          mine.id,
          "hyperliquid",
          EXCHANGE_PAGE_MARKET,
          database
        )
      ).body
    ).toBeNull()
  })
})
