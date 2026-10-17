import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import { setContentCategories } from "@/server/directory/content-categories"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { createPost, updatePost } from "@/server/posts/posts"
import { readPublicPost } from "@/server/posts/public"
import { sitePosts, POST_CONTENT_TYPE } from "@/server/posts/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * "More to read" under a post: three posts from its categories, newest first,
 * topped up with the newest posts, and never half a block.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let other: string

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  other = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

/**
 * A post dated `day` days into October, so the order is known, filed under
 * `categoryIds`.
 */
async function post(
  title: string,
  day: number,
  categoryIds: string[] = [],
  status: "draft" | "published" = "published",
  siteId: string = site.id
) {
  const created = await createPost(siteId, { title }, database)
  await updatePost(siteId, created.id, { status: "published" }, database)
  await database
    .update(sitePosts)
    .set({ publishedAt: new Date(Date.UTC(2026, 9, day)) })
    .where(eq(sitePosts.id, created.id))
  if (status === "draft") {
    await updatePost(siteId, created.id, { status }, database)
  }
  if (categoryIds.length) {
    await setContentCategories(
      siteId,
      POST_CONTENT_TYPE,
      created.id,
      categoryIds,
      database
    )
  }
  return created
}

async function moreUnder(slug: string) {
  resetPublicDirectoryCacheForTests()
  const page = await readPublicPost(site, slug, database)
  return page?.moreToRead.map((card) => card.title)
}

describe("More to read", () => {
  it("offers the three newest posts sharing a category, never the post itself", async () => {
    const patios = await createCategory(site.id, { name: "Patios" }, database)
    const reading = await post("Reading", 9, [patios.id])
    await post("Patio one", 1, [patios.id])
    await post("Patio two", 2, [patios.id])
    await post("Patio three", 3, [patios.id])
    await post("Patio four", 4, [patios.id])
    await post("Newer but unrelated", 8)

    expect(await moreUnder(reading.slug)).toEqual([
      "Patio four",
      "Patio three",
      "Patio two",
    ])
  })

  it("matches on any of the post's categories", async () => {
    const patios = await createCategory(site.id, { name: "Patios" }, database)
    const brunch = await createCategory(site.id, { name: "Brunch" }, database)
    const reading = await post("Reading", 9, [patios.id, brunch.id])
    await post("Patio", 1, [patios.id])
    await post("Brunch", 2, [brunch.id])
    await post("Both", 3, [patios.id, brunch.id])

    expect(await moreUnder(reading.slug)).toEqual(["Both", "Brunch", "Patio"])
  })

  it("never offers a draft or another site's post", async () => {
    const patios = await createCategory(site.id, { name: "Patios" }, database)
    const reading = await post("Reading", 9, [patios.id])
    await post("Patio draft", 8, [patios.id], "draft")
    await post("Elsewhere", 7, [], "published", other)
    await post("Patio one", 1, [patios.id])
    await post("Patio two", 2, [patios.id])
    await post("Plain", 3)

    expect(await moreUnder(reading.slug)).toEqual([
      "Patio two",
      "Patio one",
      "Plain",
    ])
  })

  it("tops up with the newest posts when its categories hold too few", async () => {
    const patios = await createCategory(site.id, { name: "Patios" }, database)
    const reading = await post("Reading", 9, [patios.id])
    await post("Patio", 1, [patios.id])
    await post("Old plain", 2)
    await post("New plain", 5)
    await post("Middle plain", 4)

    // The category's own post first, then the newest of the rest.
    expect(await moreUnder(reading.slug)).toEqual([
      "Patio",
      "New plain",
      "Middle plain",
    ])
  })

  it("gives a post in no category the newest posts", async () => {
    const reading = await post("Reading", 9)
    await post("One", 1)
    await post("Two", 2)
    await post("Three", 3)
    await post("Four", 4)

    expect(await moreUnder(reading.slug)).toEqual(["Four", "Three", "Two"])
  })

  it("is empty rather than short on a site with too few other posts", async () => {
    const reading = await post("Reading", 9)
    await post("One", 1)
    await post("Two", 2)
    await post("Draft", 3, [], "draft")

    expect(await moreUnder(reading.slug)).toEqual([])
  })
})
