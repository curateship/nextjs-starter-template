import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  categoryDeleteImpact,
  createCategory,
  listCategories,
} from "@/server/directory/categories"
import {
  createListing,
  setListingCategories,
} from "@/server/directory/listings"
import {
  categoryIdsFor,
  setContentCategories,
} from "@/server/directory/content-categories"
import { categoryRelationships } from "@/server/directory/schema"
import {
  createPost,
  deletePosts,
  findPost,
  listPosts,
  updatePost,
} from "@/server/posts/posts"
import { sitePosts, POST_CONTENT_TYPE } from "@/server/posts/schema"
import { customShellWorkspaces } from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The admin's promises about posts: one address per post on a site, a post is
 * dated the first time it is published, one site never sees another's posts,
 * and filing posts under a category never changes its listing count.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  await client.close()
})

describe("addresses", () => {
  it("are unique per site, numbered when derived and refused when picked", async () => {
    const first = await createPost(alpha, { title: "Best bakeries" }, database)
    const second = await createPost(alpha, { title: "Best bakeries" }, database)
    const elsewhere = await createPost(
      beta,
      { title: "Best bakeries" },
      database
    )

    expect(first.slug).toBe("best-bakeries")
    expect(second.slug).toBe("best-bakeries-2")
    expect(elsewhere.slug).toBe("best-bakeries")
    await expect(
      createPost(alpha, { title: "Other", slug: "best-bakeries" }, database)
    ).rejects.toThrow("Another post already uses the address best-bakeries")
    await expect(
      updatePost(alpha, second.id, { slug: "best-bakeries" }, database)
    ).rejects.toThrow("Another post already uses the address best-bakeries")
  })
})

describe("publishing", () => {
  it("starts as an undated draft, dates the first publish and keeps that date", async () => {
    const post = await createPost(alpha, { title: "Dated" }, database)
    expect(post.status).toBe("draft")
    expect(post.publishedAt).toBeNull()

    const published = await updatePost(
      alpha,
      post.id,
      { status: "published" },
      database
    )
    expect(published.publishedAt).toBeInstanceOf(Date)

    await updatePost(alpha, post.id, { status: "draft" }, database)
    const again = await updatePost(
      alpha,
      post.id,
      { status: "published" },
      database
    )
    expect(again.publishedAt?.getTime()).toBe(published.publishedAt?.getTime())
  })
})

describe("one site's posts", () => {
  it("lists only this site's posts, with search and the status filter", async () => {
    const draft = await createPost(alpha, { title: "Draft bakeries" }, database)
    const live = await createPost(alpha, { title: "Live cafes" }, database)
    await updatePost(alpha, live.id, { status: "published" }, database)
    await createPost(beta, { title: "Beta bakeries" }, database)

    const all = await listPosts(alpha, {}, database)
    expect(all.total).toBe(2)
    expect(all.posts.map((post) => post.id).sort()).toEqual(
      [draft.id, live.id].sort()
    )
    expect(
      (await listPosts(alpha, { search: "bakeries" }, database)).posts.map(
        (post) => post.id
      )
    ).toEqual([draft.id])
    expect(
      (await listPosts(alpha, { status: "published" }, database)).posts.map(
        (post) => post.id
      )
    ).toEqual([live.id])
    expect(await findPost(beta, live.id, database)).toBeNull()
  })

  it("puts drafts last when sorted by published date either way", async () => {
    const draft = await createPost(alpha, { title: "Draft" }, database)
    const live = await createPost(alpha, { title: "Live" }, database)
    await updatePost(alpha, live.id, { status: "published" }, database)

    for (const direction of ["asc", "desc"] as const) {
      const { posts } = await listPosts(
        alpha,
        { sort: "published", direction },
        database
      )
      expect(posts.map((post) => post.id)).toEqual([live.id, draft.id])
    }
  })

  it("goes when its site is deleted", async () => {
    await createPost(alpha, { title: "Gone with the site" }, database)
    await database
      .delete(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, alpha))
    expect(await database.select().from(sitePosts)).toEqual([])
  })
})

describe("categories", () => {
  it("files a post under this site's categories only", async () => {
    const post = await createPost(alpha, { title: "Filed" }, database)
    const mine = await createCategory(alpha, { name: "Bakeries" }, database)
    const theirs = await createCategory(beta, { name: "Cafes" }, database)

    await setContentCategories(
      alpha,
      POST_CONTENT_TYPE,
      post.id,
      [mine.id, theirs.id],
      database
    )
    expect(
      await categoryIdsFor(alpha, POST_CONTENT_TYPE, post.id, database)
    ).toEqual([mine.id])

    await setContentCategories(alpha, POST_CONTENT_TYPE, post.id, [], database)
    expect(
      await categoryIdsFor(alpha, POST_CONTENT_TYPE, post.id, database)
    ).toEqual([])
  })

  it("never changes a category's listing count", async () => {
    const bakeries = await createCategory(alpha, { name: "Bakeries" }, database)
    const listing = await createListing(alpha, { title: "Blackbird" }, database)
    await setListingCategories(alpha, listing.id, [bakeries.id], null, database)
    const post = await createPost(alpha, { title: "Best bakeries" }, database)
    await setContentCategories(
      alpha,
      POST_CONTENT_TYPE,
      post.id,
      [bakeries.id],
      database
    )

    const [category] = await listCategories(alpha, database)
    expect(category?.listingCount).toBe(1)
    // Deleting the category warns about both, counted separately.
    expect(await categoryDeleteImpact(alpha, bakeries.id, database)).toEqual({
      children: 0,
      listings: 1,
      posts: 1,
      events: 0,
    })
  })

  it("removes a deleted post's category rows with it", async () => {
    const bakeries = await createCategory(alpha, { name: "Bakeries" }, database)
    const post = await createPost(alpha, { title: "Short lived" }, database)
    await setContentCategories(
      alpha,
      POST_CONTENT_TYPE,
      post.id,
      [bakeries.id],
      database
    )

    expect(await deletePosts(alpha, [post.id, "missing"], database)).toEqual({
      done: [post.id],
      kept: ["missing"],
    })
    expect(
      await database
        .select()
        .from(categoryRelationships)
        .where(eq(categoryRelationships.contentType, POST_CONTENT_TYPE))
    ).toEqual([])
  })

  it("will not delete another site's post", async () => {
    const post = await createPost(beta, { title: "Beta's" }, database)
    expect(await deletePosts(alpha, [post.id], database)).toEqual({
      done: [],
      kept: [post.id],
    })
    expect(await findPost(beta, post.id, database)).not.toBeNull()
  })
})
