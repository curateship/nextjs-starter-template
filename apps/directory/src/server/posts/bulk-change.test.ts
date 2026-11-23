import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { RECORD_IS_GONE } from "@/lib/bulk-change"
import { createCategory } from "@/server/directory/categories"
import { categoryIdsFor } from "@/server/directory/content-categories"
import {
  createPost,
  filePostsUnderCategory,
  findPost,
  setPostsStatus,
} from "@/server/posts/posts"
import { POST_CONTENT_TYPE } from "@/server/posts/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Changing many posts at once. A post's own rule is that the first publish
 * dates it and a later one leaves that date alone, so the archive order does
 * not jump when an admin republishes a batch.
 */

let client: PGlite
let database: TestDatabase
let site: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

describe("publishing many posts at once", () => {
  it("dates the first publish and keeps that date on the second", async () => {
    const post = await createPost(site, { title: "Where to eat" }, database)

    await setPostsStatus(site, [post.id], "published", database)
    const firstTime = (await findPost(site, post.id, database))?.publishedAt
    expect(firstTime).not.toBeNull()

    await setPostsStatus(site, [post.id], "draft", database)
    await setPostsStatus(site, [post.id], "published", database)
    expect(
      (await findPost(site, post.id, database))?.publishedAt?.toISOString()
    ).toBe(firstTime?.toISOString())
  })

  it("names a post that no longer exists", async () => {
    const post = await createPost(site, { title: "Where to eat" }, database)
    const result = await setPostsStatus(
      site,
      [post.id, "a-post-that-went"],
      "published",
      database
    )
    expect(result.done).toEqual([post.id])
    expect(result.kept).toEqual([
      { id: "a-post-that-went", reason: RECORD_IS_GONE },
    ])
  })
})

describe("filing many posts under one category", () => {
  it("replaces the categories a post already had", async () => {
    const food = await createCategory(site, { name: "Food" }, database)
    const drink = await createCategory(site, { name: "Drink" }, database)
    const post = await createPost(site, { title: "Where to eat" }, database)
    await filePostsUnderCategory(site, [post.id], food.id, "add", database)

    await filePostsUnderCategory(site, [post.id], drink.id, "replace", database)
    expect(
      await categoryIdsFor(site, POST_CONTENT_TYPE, post.id, database)
    ).toEqual([drink.id])
  })

  it("leaves a post already in that category alone", async () => {
    const food = await createCategory(site, { name: "Food" }, database)
    const post = await createPost(site, { title: "Where to eat" }, database)
    await filePostsUnderCategory(site, [post.id], food.id, "add", database)

    const result = await filePostsUnderCategory(
      site,
      [post.id],
      food.id,
      "add",
      database
    )
    expect(result.same).toEqual([post.id])
    expect(result.done).toEqual([])
  })
})
