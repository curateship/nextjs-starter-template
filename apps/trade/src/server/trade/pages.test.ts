import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EXCHANGE_PAGE_MARKET, SHARED_PAGE_MARKET } from "@/lib/trade/trade-pages"
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

  it("keeps the exchange's page and All markets apart, and each exchange's own", async () => {
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
      SHARED_PAGE_MARKET,
      page({ type: "noteGridTrades" }),
      database
    )

    const exchange = await loadTradePage(
      id,
      "hyperliquid",
      EXCHANGE_PAGE_MARKET,
      database
    )
    const shared = await loadTradePage(
      id,
      "hyperliquid",
      SHARED_PAGE_MARKET,
      database
    )
    expect(JSON.parse(exchange.body!).content[0]).toEqual({ type: "noteRules" })
    expect(JSON.parse(shared.body!).content).toEqual([
      { type: "noteGridTrades" },
    ])
    // Another exchange's pages are its own.
    expect(
      (await loadTradePage(id, "phemex", SHARED_PAGE_MARKET, database)).body
    ).toBeNull()
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
    const shown = page({ type: "noteGridTrades" })
    await setTradePageCover(
      id,
      "hyperliquid",
      SHARED_PAGE_MARKET,
      "https://example.com/cover.jpg",
      shown,
      database
    )
    expect(await loadTradePage(id, "hyperliquid", SHARED_PAGE_MARKET, database)).toEqual({
      body: shown,
      locked: false,
      coverUrl: "https://example.com/cover.jpg",
    })
    await setTradePageCover(id, "hyperliquid", SHARED_PAGE_MARKET, null, page(words), database)
    // Clearing the cover leaves the page's words as they were.
    expect(await loadTradePage(id, "hyperliquid", SHARED_PAGE_MARKET, database)).toEqual({
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
