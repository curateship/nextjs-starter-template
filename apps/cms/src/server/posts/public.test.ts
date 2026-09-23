import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import { readDirectoryFeed } from "@/server/directory/feed"
import {
  createListing,
  deleteListings,
  updateListing,
} from "@/server/directory/listings"
import { readPublicCategory, type VisitorSite } from "@/server/directory/public"
import { setContentCategories } from "@/server/directory/content-categories"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { createPost, updatePost } from "@/server/posts/posts"
import { POST_CONTENT_TYPE } from "@/server/posts/schema"
import {
  postSearchResults,
  postSitemapEntries,
  readPublicPosts,
  readPublicPost,
} from "@/server/posts/public"
import { customShellWorkspaces } from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * What a visitor can reach: published posts on the site they are visiting, in
 * every place posts appear, and a listing card only while its listing is
 * published.
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

async function post(
  siteId: string,
  title: string,
  status: "draft" | "published",
  body?: unknown
) {
  const created = await createPost(siteId, { title }, database)
  return updatePost(
    siteId,
    created.id,
    { status, summary: `${title} summary`, body },
    database
  )
}

function card(listingId: string) {
  return { type: "listingCard", attrs: { listingId } }
}

async function everywhere(query: string) {
  resetPublicDirectoryCacheForTests()
  return {
    list: (await readPublicPosts(site, 1, database)).posts.map((p) => p.slug),
    search: (await postSearchResults(site.id, query, 10, database)).map(
      (result) => result.path
    ),
    sitemap: (await postSitemapEntries(site.id, database)).map(
      (entry) => entry.path
    ),
    feed: (await readDirectoryFeed(site.id, database)).map(
      (entry) => entry.path
    ),
  }
}

describe("a draft", () => {
  it("appears in none of the Posts page, search, sitemap or feed, and a published post in all", async () => {
    const live = await post(site.id, "Toronto bakeries", "published")
    const draft = await post(site.id, "Toronto bakeries draft", "draft")
    await post(other, "Toronto bakeries elsewhere", "published")

    expect(await everywhere("bakeries")).toEqual({
      list: [live.slug],
      search: [`/posts/${live.slug}`],
      sitemap: [`/posts/${live.slug}`],
      feed: [`/posts/${live.slug}`],
    })
    expect(await readPublicPost(site, draft.slug, database)).toBeNull()
    expect(await readPublicPost(site, live.slug, database)).not.toBeNull()
  })

  it("leaves when a published post goes back to draft", async () => {
    const live = await post(site.id, "Short run", "published")
    await updatePost(site.id, live.id, { status: "draft" }, database)

    expect(await everywhere("short")).toEqual({
      list: [],
      search: [],
      sitemap: [],
      feed: [],
    })
  })
})

describe("the Posts page's own switch", () => {
  it("keeps posts out of search, the sitemap, the feed and category pages while the Posts page is off", async () => {
    const bakeries = await createCategory(
      site.id,
      { name: "Bakeries" },
      database
    )
    const live = await post(site.id, "Hidden bakeries", "published")
    await setContentCategories(
      site.id,
      POST_CONTENT_TYPE,
      live.id,
      [bakeries.id],
      database
    )
    await database
      .update(customShellWorkspaces)
      .set({ settings: { pages: { "/posts": { visibility: "off" } } } })
      .where(eq(customShellWorkspaces.id, site.id))

    const found = await everywhere("hidden")
    expect(found.search).toEqual([])
    expect(found.sitemap).toEqual([])
    expect(found.feed).toEqual([])
    expect(
      (await readPublicCategory(site, bakeries.slug, { page: 1 }, database))
        ?.posts
    ).toEqual([])
  })
})

describe("listing cards", () => {
  it("draw only while the listing is published, without breaking the post", async () => {
    const shown = await createListing(site.id, { title: "Blackbird" }, database)
    await updateListing(site.id, shown.id, { status: "published" }, database)
    const drafted = await createListing(site.id, { title: "Draft" }, database)
    const deleted = await createListing(site.id, { title: "Gone" }, database)
    await updateListing(site.id, deleted.id, { status: "published" }, database)
    const foreign = await createListing(other, { title: "Beta's" }, database)
    await updateListing(other, foreign.id, { status: "published" }, database)
    await deleteListings(site.id, [deleted.id], database)

    const live = await post(site.id, "Ten bakeries", "published", {
      type: "doc",
      content: [
        card(shown.id),
        card(drafted.id),
        card(deleted.id),
        card(foreign.id),
      ],
    })

    const page = await readPublicPost(site, live.slug, database)
    expect(page?.post.body.content).toHaveLength(4)
    expect(page?.listingCards.map((listing) => listing.id)).toEqual([shown.id])
  })
})

describe("category pages", () => {
  it("show their newest published posts", async () => {
    const bakeries = await createCategory(
      site.id,
      { name: "Bakeries" },
      database
    )
    const live = await post(site.id, "Best bakeries", "published")
    const draft = await post(site.id, "Unfinished bakeries", "draft")
    await setContentCategories(
      site.id,
      POST_CONTENT_TYPE,
      live.id,
      [bakeries.id],
      database
    )
    await setContentCategories(
      site.id,
      POST_CONTENT_TYPE,
      draft.id,
      [bakeries.id],
      database
    )

    const page = await readPublicCategory(
      site,
      bakeries.slug,
      { page: 1 },
      database
    )
    expect(page?.posts.map((row) => row.slug)).toEqual([live.slug])
    expect(page?.category.listingCount).toBe(0)
  })
})
