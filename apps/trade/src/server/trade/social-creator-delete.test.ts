import { PGlite } from "@electric-sql/pglite"
import { eq, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { buildCoinMatchList } from "@/lib/trade/social/coin-matcher"
import type { ParsedSocialPost } from "@/lib/trade/social/x-profile"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  addSocialCreator,
  deleteSocialCreators,
  findSocialCreator,
  listSocialCreatorRows,
} from "@/server/trade/social-creators"
import { createSocialFolder, loadSocialFolders } from "@/server/trade/social-folders"
import { fillPostCoinsForCreator } from "@/server/trade/social-post-coins"
import { storeSocialPosts } from "@/server/trade/social-posts"
import {
  tradeSocialPostCoins,
  tradeSocialPosts,
} from "@/server/trade/schema"
import { DEFAULT_CREATORS_QUERY } from "@/lib/trade/social/creators-query"

/**
 * Deleting a tracked creator, and what goes with them.
 *
 * The match list is mocked because the real one asks an exchange, and a test
 * must not. These posts name SOL so there is something in
 * `trade_social_post_coins` for the cascade to take.
 */
vi.mock("@/server/trade/social-coin-list", () => ({
  loadMarketMatchList: async () =>
    buildCoinMatchList([
      { symbol: "SOL", key: "hyperliquid:mainnet:SOL", kind: "coin" as const },
    ]),
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

function postsNaming(coin: string, count = 2): ParsedSocialPost[] {
  return Array.from({ length: count }, (_, index) => ({
    sourceId: `21000000000000001${String(index).padStart(2, "0")}`,
    postedAt: POSTED + index * 60_000,
    text: `post ${index + 1}: buying $${coin}`,
    url: null,
    seen: 100 + index,
    likes: 1,
    replies: 0,
    reposts: 0,
    replyToId: null,
  }))
}

/** A member tracking one creator who has two posts, both naming SOL. */
async function memberTracking(handle: string) {
  const user = await insertUser(database)
  await addSocialCreator(user.id, handle)
  const creator = await findSocialCreator(user.id, handle)
  await storeSocialPosts(user.id, creator!.id, postsNaming("SOL"))
  await fillPostCoinsForCreator(user.id, creator!.id)
  return { userId: user.id, creatorId: creator!.id }
}

const countPosts = async (userId: string) => {
  const [row] = await database
    .select({ held: sql<number>`count(*)::int` })
    .from(tradeSocialPosts)
    .where(eq(tradeSocialPosts.userId, userId))
  return row.held
}

const countCoins = async (userId: string) => {
  const [row] = await database
    .select({ held: sql<number>`count(*)::int` })
    .from(tradeSocialPostCoins)
    .where(eq(tradeSocialPostCoins.userId, userId))
  return row.held
}

const handles = async (userId: string) =>
  (await listSocialCreatorRows(userId, DEFAULT_CREATORS_QUERY)).rows.map(
    (row) => row.handle
  )

describe("deleting a tracked creator", () => {
  it("takes the creator off the list and says which id went", async () => {
    const { userId, creatorId } = await memberTracking("macrodan")

    const { deleted } = await deleteSocialCreators(userId, [creatorId])

    expect(deleted).toEqual([creatorId])
    expect(await handles(userId)).toEqual([])
  })

  it("lets go of the posts and the markets read out of them", async () => {
    const { userId, creatorId } = await memberTracking("macrodan")
    expect(await countPosts(userId)).toBe(2)
    expect(await countCoins(userId)).toBe(2)

    await deleteSocialCreators(userId, [creatorId])

    expect(await countPosts(userId)).toBe(0)
    expect(await countCoins(userId)).toBe(0)
  })

  it("takes the creator out of the folder they sat in", async () => {
    const { userId, creatorId } = await memberTracking("macrodan")
    await createSocialFolder(userId, { name: "Trusted", creatorId })
    const before = await loadSocialFolders(userId)
    expect(before[0].creatorIds).toEqual([creatorId])

    await deleteSocialCreators(userId, [creatorId])

    const after = await loadSocialFolders(userId)
    // The folder stays; the creator is no longer in it.
    expect(after.map((one) => one.name)).toEqual(["Trusted"])
    expect(after[0].creatorIds).toEqual([])
  })

  it("deletes several at once and names each id that went", async () => {
    const user = await insertUser(database)
    for (const handle of ["one", "two", "three"]) {
      await addSocialCreator(user.id, handle)
    }
    const rows = await listSocialCreatorRows(user.id, DEFAULT_CREATORS_QUERY)
    const two = rows.rows.slice(0, 2).map((row) => row.id)

    const { deleted } = await deleteSocialCreators(user.id, two)

    expect(deleted.sort()).toEqual([...two].sort())
    expect((await handles(user.id)).length).toBe(1)
  })

  it("never touches another member's creator, and does not say it exists", async () => {
    const mine = await memberTracking("macrodan")
    const theirs = await memberTracking("someoneelse")

    const { deleted } = await deleteSocialCreators(mine.userId, [
      theirs.creatorId,
    ])

    // Neither deleted nor reported: the id simply did not match this member.
    expect(deleted).toEqual([])
    expect(await handles(theirs.userId)).toEqual(["someoneelse"])
    expect(await countPosts(theirs.userId)).toBe(2)
  })

  it("reports an id that was already gone as one that did not go", async () => {
    const { userId, creatorId } = await memberTracking("macrodan")
    await deleteSocialCreators(userId, [creatorId])

    const { deleted } = await deleteSocialCreators(userId, [creatorId])

    // The screen turns this into "0 creators deleted, 1 could not be".
    expect(deleted).toEqual([])
  })

  it("answers an empty list without asking the database anything", async () => {
    const { userId } = await memberTracking("macrodan")

    expect(await deleteSocialCreators(userId, [])).toEqual({ deleted: [] })
    expect(await handles(userId)).toEqual(["macrodan"])
  })

  it("frees the handle, so the same account can be added again", async () => {
    const { userId, creatorId } = await memberTracking("macrodan")
    await deleteSocialCreators(userId, [creatorId])

    const again = await addSocialCreator(userId, "macrodan")

    expect(again.handle).toBe("macrodan")
    expect(again.id).not.toBe(creatorId)
    // Starting from nothing is the point: the old posts did not come back.
    expect(await countPosts(userId)).toBe(0)
  })
})
