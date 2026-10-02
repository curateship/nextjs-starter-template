import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CustomShellDb } from "@/server/db"
import {
  buildCoinMatchList,
  type MarketToMatch,
} from "@/lib/trade/social/coin-matcher"
import type { ParsedSocialPost } from "@/lib/trade/social/x-profile"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  loadSocialMatchStocks,
  saveSocialMatchStocks,
} from "@/server/trade/prefs"
import { addSocialCreator, findSocialCreator } from "@/server/trade/social-creators"
import {
  catchUpAfterStocksSwitch,
  fillPostCoinsForCreator,
} from "@/server/trade/social-post-coins"
import {
  loadSocialDashboard,
  storeSocialPosts,
} from "@/server/trade/social-posts"

/**
 * The stocks switch, end to end over the database.
 *
 * The match list is mocked, because the real one asks Hyperliquid, edgeX and
 * ApeX Omni and a test must not ask an exchange anything. The mock honours the
 * `includeStocks` argument, which is the thing being tested: with it false the
 * list is coins alone, exactly as the real one builds it.
 */
vi.mock("@/server/trade/social-coin-list", () => ({
  loadMarketMatchList: async (includeStocks: boolean) => {
    const coins: MarketToMatch[] = ["SOL", "ETH"].map((symbol) => ({
      symbol,
      key: `hyperliquid:mainnet:${symbol}`,
      kind: "coin" as const,
    }))
    const stocks: MarketToMatch[] = [
      { symbol: "TSLA", key: "edgex:mainnet:TSLAUSDC", kind: "stock" as const },
      { symbol: "XAU", key: "edgex:mainnet:XAUUSDC", kind: "commodity" as const },
    ]
    return buildCoinMatchList(includeStocks ? [...coins, ...stocks] : coins)
  },
}))

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => client.close())

const POSTED = Date.UTC(2026, 4, 1, 9, 15)

const POSTS: ParsedSocialPost[] = [
  {
    sourceId: "2100000000000000001",
    postedAt: POSTED,
    text: "$TSLA into earnings, and $XAU, plus $SOL",
    url: null,
    seen: 1200,
    likes: 10,
    replies: 1,
    reposts: 2,
    replyToId: null,
  },
]

/** A member tracking one creator whose one post names a stock and a coin. */
async function creatorWithOnePost() {
  const user = await insertUser(database)
  await addSocialCreator(user.id, "macrodan")
  const creator = await findSocialCreator(user.id, "macrodan")
  await storeSocialPosts(user.id, creator!.id, POSTS)
  await fillPostCoinsForCreator(user.id, creator!.id)
  return { userId: user.id, creatorId: creator!.id }
}

/** Every ticker on the markets panel, with what kind each one is. */
async function panel(userId: string) {
  const { markets } = await loadSocialDashboard(userId, "macrodan")
  return markets.map((row) => `${row.market}:${row.kind}`)
}

describe("the stocks switch", () => {
  it("starts off, so no stock is ever matched", async () => {
    const { userId } = await creatorWithOnePost()

    expect(await loadSocialMatchStocks(userId)).toBe(false)
    expect(await panel(userId)).toEqual(["SOL:coin"])
  })

  it("matches stocks and metals once it is on", async () => {
    const { userId, creatorId } = await creatorWithOnePost()

    await saveSocialMatchStocks(userId, true)
    await catchUpAfterStocksSwitch(userId, true)
    await fillPostCoinsForCreator(userId, creatorId)

    expect((await panel(userId)).sort()).toEqual([
      "SOL:coin",
      "TSLA:stock",
      "XAU:commodity",
    ])
  })

  it("marks posts unread when it goes on, so they are read again", async () => {
    const { userId } = await creatorWithOnePost()

    await saveSocialMatchStocks(userId, true)
    await catchUpAfterStocksSwitch(userId, true)

    // Nothing has re-read yet, so the stock is not there until a pass runs.
    expect(await panel(userId)).toEqual(["SOL:coin"])
  })

  it("drops every stock row when it goes off, and keeps the coins", async () => {
    const { userId, creatorId } = await creatorWithOnePost()
    await saveSocialMatchStocks(userId, true)
    await catchUpAfterStocksSwitch(userId, true)
    await fillPostCoinsForCreator(userId, creatorId)

    await saveSocialMatchStocks(userId, false)
    await catchUpAfterStocksSwitch(userId, false)

    expect(await panel(userId)).toEqual(["SOL:coin"])
  })

  it("carries the venue that listed the stock, not Hyperliquid", async () => {
    const { userId, creatorId } = await creatorWithOnePost()
    await saveSocialMatchStocks(userId, true)
    await catchUpAfterStocksSwitch(userId, true)
    await fillPostCoinsForCreator(userId, creatorId)

    const { markets } = await loadSocialDashboard(userId, "macrodan")
    const tesla = markets.find((row) => row.market === "TSLA")
    expect(tesla?.marketKey).toBe("edgex:mainnet:TSLAUSDC")
  })
})
