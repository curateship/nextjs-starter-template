import { PGlite } from "@electric-sql/pglite"
import { eq, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import { setContentCategories } from "@/server/directory/content-categories"
import { readPublicCategory, type VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { directoryFeaturedEntitlements } from "@/server/directory/schema"
import { frontPageRowPosts } from "@/server/posts/cards"
import { createPost, findPost, updatePost } from "@/server/posts/posts"
import { readPublicPosts } from "@/server/posts/public"
import { sitePosts, POST_CONTENT_TYPE } from "@/server/posts/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The free featured switch on a post: where it lifts a post to, where it
 * leaves the order alone, and that it never buys or places anything.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

/** A published post dated `day` days into October, so the order is known. */
async function published(title: string, day: number) {
  const created = await createPost(site.id, { title }, database)
  await updatePost(site.id, created.id, { status: "published" }, database)
  await database
    .update(sitePosts)
    .set({ publishedAt: new Date(Date.UTC(2026, 9, day)) })
    .where(eq(sitePosts.id, created.id))
  return created
}

function feature(id: string, featured = true) {
  return updatePost(site.id, id, { featured }, database)
}

async function postsPage() {
  resetPublicDirectoryCacheForTests()
  return (await readPublicPosts(site, 1, database)).posts.map((p) => p.title)
}

async function row(limit: number, categoryId: string | null = null) {
  return (await frontPageRowPosts(site.id, limit, categoryId, database)).map(
    (p) => p.title
  )
}

describe("a featured post", () => {
  it("is off for a new post and is kept once switched on", async () => {
    const post = await published("Patios", 1)
    expect((await findPost(site.id, post.id, database))?.featured).toBe(false)

    await feature(post.id)
    expect((await findPost(site.id, post.id, database))?.featured).toBe(true)
  })

  it("creates no paid placement", async () => {
    const post = await published("Patios", 1)
    await feature(post.id)
    await feature(post.id, false)
    await feature(post.id)

    const [{ count }] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(directoryFeaturedEntitlements)
    expect(count).toBe(0)
  })

  it("leaves the order exactly as it was while nothing is featured", async () => {
    await published("Oldest", 1)
    await published("Newest", 3)
    await published("Middle", 2)

    expect(await postsPage()).toEqual(["Newest", "Middle", "Oldest"])
    expect(await row(3)).toEqual(["Newest", "Middle", "Oldest"])
  })

  it("goes to the top of the Posts page and first in the front page row", async () => {
    const oldest = await published("Oldest", 1)
    await published("Newest", 3)
    await published("Middle", 2)
    await feature(oldest.id)

    expect(await postsPage()).toEqual(["Oldest", "Newest", "Middle"])
    expect(await row(2)).toEqual(["Oldest", "Newest"])
  })

  it("puts the newest first when several are featured", async () => {
    const oldest = await published("Oldest", 1)
    const middle = await published("Middle", 2)
    await published("Newest", 3)
    await feature(oldest.id)
    await feature(middle.id)

    expect(await postsPage()).toEqual(["Middle", "Oldest", "Newest"])
  })

  it("keeps a featured draft off the Posts page", async () => {
    const draft = await createPost(site.id, { title: "Draft" }, database)
    await feature(draft.id)
    await published("Live", 1)

    expect(await postsPage()).toEqual(["Live"])
  })

  it("only leads a category row it is filed in, and a category page keeps newest first", async () => {
    const patios = await createCategory(site.id, { name: "Patios" }, database)
    const elsewhere = await published("Elsewhere", 1)
    const olderPatio = await published("Older patio", 2)
    const newerPatio = await published("Newer patio", 3)
    for (const post of [olderPatio, newerPatio]) {
      await setContentCategories(
        site.id,
        POST_CONTENT_TYPE,
        post.id,
        [patios.id],
        database
      )
    }
    await feature(elsewhere.id)
    await feature(olderPatio.id)

    expect(await row(3, patios.id)).toEqual(["Older patio", "Newer patio"])

    resetPublicDirectoryCacheForTests()
    const page = await readPublicCategory(
      site,
      patios.slug,
      { page: 1 },
      database
    )
    expect(page?.posts.map((p) => p.title)).toEqual([
      "Newer patio",
      "Older patio",
    ])
  })
})
