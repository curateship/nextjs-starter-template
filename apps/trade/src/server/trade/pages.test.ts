import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROTOCOLS_BLOCK_NODE } from "@/lib/trade/trade-pages"
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

const protocols = { type: PROTOCOLS_BLOCK_NODE }

const words = {
  type: "paragraph",
  content: [{ type: "text", text: "Watch the funding." }],
}

/** The Trade dashboard's left page: one per person, the same on every exchange. */
describe("the Trade dashboard's page", () => {
  it("has no page until one is written, so the starting page shows", async () => {
    const { id } = await insertUser(database)
    expect(await loadTradePage(id, database)).toEqual({
      body: null,
      locked: false,
      coverUrl: null,
      coverImages: [],
    })
  })

  it("keeps what was written and reads it back with its Protocols block", async () => {
    const { id } = await insertUser(database)
    const saved = await saveTradePage(id, page(protocols, { type: "noteRules" }, words), database)
    expect(saved.body).toBe(page(protocols, { type: "noteRules" }, words))
    expect((await loadTradePage(id, database)).body).toBe(page(protocols, { type: "noteRules" }, words))
  })

  it("puts the Protocols block back on a page saved without it", async () => {
    const { id } = await insertUser(database)
    await saveTradePage(id, page({ type: "noteRules" }), database)
    expect(JSON.parse((await loadTradePage(id, database)).body!).content).toEqual([
      protocols,
      { type: "noteRules" },
    ])
  })

  it("refuses a save while the page is locked, and takes one again once unlocked", async () => {
    const { id } = await insertUser(database)
    const shown = page(protocols, { type: "noteRules" })
    await setTradePageLocked(id, true, shown, database)
    // Locking a page never written keeps what it showed.
    expect(await loadTradePage(id, database)).toEqual({
      body: shown,
      locked: true,
      coverUrl: null,
      coverImages: [],
    })
    await expect(saveTradePage(id, page(protocols, words), database)).rejects.toThrow(
      PAGE_LOCKED_MESSAGE
    )

    await setTradePageLocked(id, false, page(protocols, words), database)
    // Unlocking leaves the words that were there.
    expect((await loadTradePage(id, database)).body).toBe(shown)
    await saveTradePage(id, page(protocols, words), database)
    expect((await loadTradePage(id, database)).body).toBe(page(protocols, words))
  })

  it("keeps the cover and the page's own pictures, as the shell's pages do", async () => {
    const { id } = await insertUser(database)
    const shown = page(protocols, { type: "noteGridTrades" })
    const picture = "https://example.com/cover.jpg"
    await setTradePageCover(id, { coverUrl: picture, coverImages: [picture] }, shown, database)
    expect(await loadTradePage(id, database)).toEqual({
      body: shown,
      locked: false,
      coverUrl: picture,
      coverImages: [picture],
    })
    // The sky keeps the pictures as tiles; the page's words stay as they were.
    await setTradePageCover(id, { coverUrl: "sky", coverImages: [picture] }, page(protocols, words), database)
    expect(await loadTradePage(id, database)).toMatchObject({ body: shown, coverUrl: "sky", coverImages: [picture] })
    await setTradePageCover(id, { coverUrl: null, coverImages: [] }, shown, database)
    expect(await loadTradePage(id, database)).toMatchObject({ coverUrl: null, coverImages: [] })
  })

  it("keeps one person's page away from another's", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)
    await saveTradePage(theirs.id, page(protocols, words), database)
    expect((await loadTradePage(mine.id, database)).body).toBeNull()
  })
})
