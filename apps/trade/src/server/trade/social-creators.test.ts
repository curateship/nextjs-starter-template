import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_CREATORS_QUERY,
  type SocialCreatorsQuery,
} from "@/lib/trade/social/creators-query"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  addSocialCreator,
  findSocialCreator,
  listSocialCreatorRows,
  saveSocialCreatorDetails,
} from "@/server/trade/social-creators"
import type { ParsedSocialCreator } from "@/lib/trade/social/x-profile"
import { storeSocialPosts } from "@/server/trade/social-posts"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => client.close())

const DAY = 86400000

/**
 * Posts for a creator, written down the way a sync writes them. Drives the
 * real store rather than inserting rows behind it, so the duplicate rule is
 * exercised by every test that seeds.
 */
async function addPosts(
  userId: string,
  handle: string,
  posts: Array<{ id: string; daysAgo: number; text: string }>
) {
  const creator = await findSocialCreator(userId, handle)
  if (!creator) throw new Error(`no creator ${handle}`)
  await storeSocialPosts(
    userId,
    creator.id,
    posts.map((post) => ({
      sourceId: post.id,
      postedAt: Date.now() - post.daysAgo * DAY,
      text: post.text,
      url: `https://x.com/${handle}/status/${post.id}`,
      seen: 1000,
      likes: 10,
      replies: 1,
      reposts: 2,
      replyToId: null,
      markets: [],
    }))
  )
}

/** `count` posts one day apart, ending `daysAgo` days back. */
function run(count: number, daysAgo: number, words: string, tag: string) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${tag}-${index}`,
    daysAgo: daysAgo + (count - 1 - index),
    text: `${words} ${index + 1}`,
  }))
}

async function member() {
  const user = await insertUser(database)
  return user.id
}

/** Four creators, deliberately different on every axis the filters use. */
async function fourCreators(userId: string) {
  await addSocialCreator(userId, "cryptosam")
  await addPosts(userId, "cryptosam", run(60, 2, "SOL to the moon", "sam"))
  await addSocialCreator(userId, "altcoinjen")
  await addPosts(userId, "altcoinjen", run(10, 0, "eth looks fine", "jen"))
  await addSocialCreator(userId, "macrodan")
  await addPosts(userId, "macrodan", run(4, 45, "bonds", "dan"))
  await addSocialCreator(userId, "quietbob")
}

function ask(over: Partial<SocialCreatorsQuery> = {}): SocialCreatorsQuery {
  return { ...DEFAULT_CREATORS_QUERY, ...over }
}

const handles = (list: { rows: Array<{ handle: string }> }) =>
  list.rows.map((row) => row.handle)

describe("the creators list", () => {
  it("shows every creator with what is held for each", async () => {
    const userId = await member()
    await fourCreators(userId)

    const list = await listSocialCreatorRows(userId, ask())

    expect(list.total).toBe(4)
    expect(list.rows).toHaveLength(4)
    const sam = list.rows.find((row) => row.handle === "cryptosam")
    expect(sam?.postsHeld).toBe(60)
    expect(sam?.lastPostAt).not.toBeNull()
    const bob = list.rows.find((row) => row.handle === "quietbob")
    expect(bob?.postsHeld).toBe(0)
    expect(bob?.lastPostAt).toBeNull()
  })

  it("shows none of another member's creators", async () => {
    const first = await member()
    const second = await member()
    await fourCreators(first)

    const list = await listSocialCreatorRows(second, ask())

    expect(list.rows).toHaveLength(0)
    expect(list.total).toBe(0)
  })
})

describe("the search box", () => {
  it("matches the handle", async () => {
    const userId = await member()
    await fourCreators(userId)

    expect(
      handles(await listSocialCreatorRows(userId, ask({ q: "jen" })))
    ).toEqual(["altcoinjen"])
  })

  it("matches the words of a post, under a handle that never says so", async () => {
    const userId = await member()
    await fourCreators(userId)

    expect(
      handles(await listSocialCreatorRows(userId, ask({ q: "sol" })))
    ).toEqual(["cryptosam"])
  })

  it("ignores capitals", async () => {
    const userId = await member()
    await fourCreators(userId)

    expect(
      handles(await listSocialCreatorRows(userId, ask({ q: "BONDS" })))
    ).toEqual(["macrodan"])
  })

  it("treats a percent sign as a percent sign, not as everything", async () => {
    const userId = await member()
    await fourCreators(userId)

    const list = await listSocialCreatorRows(userId, ask({ q: "%" }))

    expect(list.rows).toHaveLength(0)
  })

  it("never reaches another member's posts", async () => {
    const first = await member()
    const second = await member()
    await fourCreators(first)
    await addSocialCreator(second, "cryptosam")

    const list = await listSocialCreatorRows(second, ask({ q: "sol" }))

    expect(list.rows).toHaveLength(0)
  })
})

describe("the filters", () => {
  it("splits on how many posts are held", async () => {
    const userId = await member()
    await fourCreators(userId)

    expect(
      handles(
        await listSocialCreatorRows(userId, ask({ posts: "under50" }))
      ).sort()
    ).toEqual(["altcoinjen", "macrodan", "quietbob"])
    expect(
      handles(await listSocialCreatorRows(userId, ask({ posts: "50to500" })))
    ).toEqual(["cryptosam"])
    expect(
      handles(await listSocialCreatorRows(userId, ask({ posts: "over500" })))
    ).toEqual([])
  })

  it("splits on when the last post was", async () => {
    const userId = await member()
    await fourCreators(userId)

    expect(
      handles(await listSocialCreatorRows(userId, ask({ last: "week" }))).sort()
    ).toEqual(["altcoinjen", "cryptosam"])
    expect(
      handles(
        await listSocialCreatorRows(userId, ask({ last: "month" }))
      ).sort()
    ).toEqual(["altcoinjen", "cryptosam"])
    expect(
      handles(await listSocialCreatorRows(userId, ask({ last: "older" })))
    ).toEqual(["macrodan"])
  })

  it("leaves a creator with nothing held out of gone quiet", async () => {
    const userId = await member()
    await fourCreators(userId)

    const quiet = await listSocialCreatorRows(userId, ask({ last: "older" }))

    expect(quiet.rows.map((row) => row.handle)).not.toContain("quietbob")
  })

  it("keeps counting every creator while the filters narrow the rows", async () => {
    const userId = await member()
    await fourCreators(userId)

    const list = await listSocialCreatorRows(userId, ask({ last: "older" }))

    expect(list.rows).toHaveLength(1)
    expect(list.total).toBe(4)
  })

  it("stacks the search on top of the filters", async () => {
    const userId = await member()
    await fourCreators(userId)

    expect(
      handles(
        await listSocialCreatorRows(userId, ask({ q: "sol", last: "older" }))
      )
    ).toEqual([])
    expect(
      handles(
        await listSocialCreatorRows(userId, ask({ q: "sol", last: "week" }))
      )
    ).toEqual(["cryptosam"])
  })
})

describe("followers", () => {
  /** What a profile read said about the account, rather than about a post. */
  async function saidAbout(
    userId: string,
    handle: string,
    details: Partial<ParsedSocialCreator>
  ) {
    const creator = await findSocialCreator(userId, handle)
    if (!creator) throw new Error(`no creator ${handle}`)
    await saveSocialCreatorDetails(userId, creator.id, {
      followers: null,
      displayName: null,
      picture: null,
      links: null,
      ...details,
    })
  }

  it("stores what a profile read said about the account", async () => {
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")

    await saidAbout(userId, "cryptosam", {
      followers: 41200,
      displayName: "Crypto Sam",
      links: [{ label: "sam.xyz", url: "https://sam.xyz/" }],
    })

    const [row] = (await listSocialCreatorRows(userId, ask())).rows
    expect(row.followers).toBe(41200)
    expect(row.displayName).toBe("Crypto Sam")
    expect(row.links).toEqual([{ label: "sam.xyz", url: "https://sam.xyz/" }])
    expect(row.followersAt).not.toBeNull()
  })

  it("leaves a known count alone when the next read says nothing about it", async () => {
    // X changes its markup and the count stops being found. The last one that
    // worked has to stay on screen rather than the panel going blank.
    const userId = await member()
    await addSocialCreator(userId, "cryptosam")
    await saidAbout(userId, "cryptosam", { followers: 41200 })

    await saidAbout(userId, "cryptosam", { displayName: "Sam" })

    const [row] = (await listSocialCreatorRows(userId, ask())).rows
    expect(row.followers).toBe(41200)
    expect(row.displayName).toBe("Sam")
  })

  it("puts a creator nobody has a count for last, whichever way the arrow points", async () => {
    const userId = await member()
    await addSocialCreator(userId, "hasnumber")
    await saidAbout(userId, "hasnumber", { followers: 500 })
    await addSocialCreator(userId, "hasbigger")
    await saidAbout(userId, "hasbigger", { followers: 9000 })
    await addSocialCreator(userId, "nonumber")

    expect(
      handles(await listSocialCreatorRows(userId, ask({ sort: "followers" })))
    ).toEqual(["hasbigger", "hasnumber", "nonumber"])
    expect(
      handles(
        await listSocialCreatorRows(
          userId,
          ask({ sort: "followers", dir: "asc" })
        )
      )
    ).toEqual(["hasnumber", "hasbigger", "nonumber"])
  })
})

describe("the sort", () => {
  it("puts the newest post first by default, and a creator with none last", async () => {
    const userId = await member()
    await fourCreators(userId)

    expect(handles(await listSocialCreatorRows(userId, ask()))).toEqual([
      "altcoinjen",
      "cryptosam",
      "macrodan",
      "quietbob",
    ])
  })

  it("keeps a creator with nothing held last when the order is flipped", async () => {
    const userId = await member()
    await fourCreators(userId)

    expect(
      handles(await listSocialCreatorRows(userId, ask({ dir: "asc" })))
    ).toEqual(["macrodan", "cryptosam", "altcoinjen", "quietbob"])
  })

  it("sorts on posts held, both ways", async () => {
    const userId = await member()
    await fourCreators(userId)

    expect(
      handles(await listSocialCreatorRows(userId, ask({ sort: "posts" })))
    ).toEqual(["cryptosam", "altcoinjen", "macrodan", "quietbob"])
    expect(
      handles(
        await listSocialCreatorRows(userId, ask({ sort: "posts", dir: "asc" }))
      )
    ).toEqual(["quietbob", "macrodan", "altcoinjen", "cryptosam"])
  })

  it("sorts on the handle, ignoring capitals", async () => {
    const userId = await member()
    await fourCreators(userId)

    expect(
      handles(
        await listSocialCreatorRows(userId, ask({ sort: "handle", dir: "asc" }))
      )
    ).toEqual(["altcoinjen", "cryptosam", "macrodan", "quietbob"])
  })
})
