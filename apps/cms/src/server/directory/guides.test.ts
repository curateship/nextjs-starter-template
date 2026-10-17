import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readDirectoryFeed } from "@/server/directory/feed"
import { guideShareImageResponse } from "@/server/directory/guide-share-image"
import {
  createGuide,
  deleteGuides,
  findGuideForEdit,
  guideSearchResults,
  guideSitemapEntries,
  listGuides,
  readPublicGuide,
  readPublicGuides,
  updateGuide,
} from "@/server/directory/guides"
import {
  createListing,
  deleteListings,
  updateListing,
} from "@/server/directory/listings"
import { currentAddressFor } from "@/server/directory/old-addresses"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { customShellWorkspaces } from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Guides the editor writes. Two sites throughout, because a guide's address is
 * unique within its site and free on another, and a query missing its site
 * filter passes every single-site test there is.
 */

let client: PGlite
let database: TestDatabase
let alpha: VisitorSite
let beta: VisitorSite

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alphaRow = await insertWorkspace(database, { name: "Alpha" })
  const betaRow = await insertWorkspace(database, { name: "Beta" })
  alpha = { id: alphaRow.id, name: "Alpha", url: "https://alpha.example.com" }
  beta = { id: betaRow.id, name: "Beta", url: "https://beta.example.com" }
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function listing(site: { id: string }, title: string) {
  const made = await createListing(site.id, { title }, database)
  return updateListing(site.id, made.id, { status: "published" }, database)
}

/** A published guide of these listings, in this order. */
async function guide(
  site: { id: string },
  title: string,
  listingIds: string[]
) {
  const made = await createGuide(site.id, { title }, database)
  return updateGuide(
    site.id,
    made.id,
    { status: "published", intro: `All about ${title}.`, listingIds },
    database
  )
}

const slugs = (rows: { slug: string }[]) => rows.map((row) => row.slug)

describe("a guide's address", () => {
  it("is unique within its site and free on another", async () => {
    const first = await createGuide(alpha.id, { title: "Best brunch" }, database)
    const second = await createGuide(
      alpha.id,
      { title: "Best brunch" },
      database
    )
    const elsewhere = await createGuide(
      beta.id,
      { title: "Best brunch" },
      database
    )

    expect(first.slug).toBe("best-brunch")
    expect(second.slug).toBe("best-brunch-2")
    expect(elsewhere.slug).toBe("best-brunch")
    await expect(
      updateGuide(alpha.id, second.id, { slug: "best-brunch" }, database)
    ).rejects.toThrow("Another guide already uses the address best-brunch.")
  })

  it("forwards its old address after a rename", async () => {
    const made = await guide(alpha, "Best brunch", [])
    await updateGuide(alpha.id, made.id, { slug: "brunch-west-end" }, database)

    expect(
      await currentAddressFor(alpha.id, "guide", "best-brunch", database)
    ).toBe("brunch-west-end")

    await deleteGuides(alpha.id, [made.id], database)
    expect(
      await currentAddressFor(alpha.id, "guide", "best-brunch", database)
    ).toBeNull()
  })
})

describe("the guide window", () => {
  it("keeps the order of nine listings after a save and a reload", async () => {
    const nine: { id: string }[] = []
    for (let index = 1; index <= 9; index += 1) {
      nine.push(await listing(alpha, `Brunch place ${index}`))
    }
    const made = await guide(
      alpha,
      "Best brunch",
      nine.map((row) => row.id)
    )

    const shuffled = [8, 2, 5, 0, 7, 1, 4, 6, 3].map((at) => nine[at]!.id)
    await updateGuide(alpha.id, made.id, { listingIds: shuffled }, database)

    const reloaded = await findGuideForEdit(alpha.id, made.id, database)
    expect(reloaded?.listings.map((row) => row.id)).toEqual(shuffled)
  })

  it("drops a listing from another site, and a repeat of one already in", async () => {
    const mine = await listing(alpha, "Mine")
    const theirs = await listing(beta, "Theirs")
    const made = await guide(alpha, "Mixed", [mine.id, theirs.id, mine.id])

    const reloaded = await findGuideForEdit(alpha.id, made.id, database)
    expect(reloaded?.listings.map((row) => row.title)).toEqual(["Mine"])
    // Another site's guide is not found by id from this one.
    expect(await findGuideForEdit(beta.id, made.id, database)).toBeNull()
  })

  it("counts every listing and the ones a visitor sees on the Guides screen", async () => {
    const shown = await listing(alpha, "Shown")
    const hidden = await listing(alpha, "Hidden")
    await guide(alpha, "Two", [shown.id, hidden.id])
    await updateListing(alpha.id, hidden.id, { status: "draft" }, database)

    const { guides } = await listGuides(alpha.id, {}, database)
    expect(guides.map((row) => [row.listings, row.shown])).toEqual([[2, 1]])
  })
})

describe("the public page", () => {
  it("shows the published listings in the guide's order", async () => {
    const first = await listing(alpha, "First")
    const second = await listing(alpha, "Second")
    const third = await listing(alpha, "Third")
    await guide(alpha, "Best brunch", [third.id, first.id, second.id])

    const page = await readPublicGuide(alpha, "best-brunch", database)
    expect(page?.guide.title).toBe("Best brunch")
    expect(slugs(page?.listings ?? [])).toEqual(["third", "first", "second"])
    // Another site's address is a different question.
    expect(await readPublicGuide(beta, "best-brunch", database)).toBeNull()
  })

  it("leaves out an unpublished listing, and a deleted one leaves the guide", async () => {
    const kept = await listing(alpha, "Kept")
    const unpublished = await listing(alpha, "Unpublished")
    const closed = await listing(alpha, "Closed")
    const deleted = await listing(alpha, "Deleted")
    const made = await guide(alpha, "Best brunch", [
      kept.id,
      unpublished.id,
      closed.id,
      deleted.id,
    ])
    await updateListing(alpha.id, unpublished.id, { status: "draft" }, database)
    await updateListing(alpha.id, closed.id, { status: "closed" }, database)
    await deleteListings(alpha.id, [deleted.id], database)
    resetPublicDirectoryCacheForTests()

    const page = await readPublicGuide(alpha, "best-brunch", database)
    expect(slugs(page?.listings ?? [])).toEqual(["kept"])

    // The window still holds the two that are hidden, marked by their status.
    const reloaded = await findGuideForEdit(alpha.id, made.id, database)
    expect(reloaded?.listings.map((row) => [row.title, row.status])).toEqual([
      ["Kept", "published"],
      ["Unpublished", "draft"],
      ["Closed", "closed"],
    ])
  })

  it("draws an empty guide rather than failing when nothing in it is published", async () => {
    const only = await listing(alpha, "Only")
    await guide(alpha, "Quiet", [only.id])
    await updateListing(alpha.id, only.id, { status: "draft" }, database)
    resetPublicDirectoryCacheForTests()

    const page = await readPublicGuide(alpha, "quiet", database)
    expect(page?.guide.title).toBe("Quiet")
    expect(page?.listings).toEqual([])
  })
})

describe("a draft guide is nowhere", () => {
  async function everywhere(slug: string) {
    resetPublicDirectoryCacheForTests()
    const card = await guideShareImageResponse({
      request: new Request(
        `https://alpha.example.com/guides/share-image/${slug}`
      ),
      site: alpha,
      slug,
      requestAddress: "test",
      database,
      limit: async () => undefined,
      draw: () => "<svg/>",
    })
    return {
      page: Boolean(await readPublicGuide(alpha, slug, database)),
      list: slugs((await readPublicGuides(alpha, database)).guides),
      sitemap: (await guideSitemapEntries(alpha.id, database)).map(
        (entry) => entry.path
      ),
      search: (await guideSearchResults(alpha.id, "brunch", 10, database)).map(
        (result) => result.path
      ),
      feed: (await readDirectoryFeed(alpha.id, database))
        .filter((entry) => entry.path.startsWith("/guides/"))
        .map((entry) => entry.path),
      // A wrong version answers with a redirect to the right one; a missing
      // guide answers 404.
      shareCard: card.status,
    }
  }

  it("is in none of the page, the list, the sitemap, search, the feed or the share card", async () => {
    const made = await createGuide(alpha.id, { title: "Best brunch" }, database)
    expect(await everywhere("best-brunch")).toEqual({
      page: false,
      list: [],
      sitemap: [],
      search: [],
      feed: [],
      shareCard: 404,
    })

    await updateGuide(alpha.id, made.id, { status: "published" }, database)
    expect(await everywhere("best-brunch")).toEqual({
      page: true,
      list: ["best-brunch"],
      sitemap: ["/guides/best-brunch"],
      search: ["/guides/best-brunch"],
      feed: ["/guides/best-brunch"],
      shareCard: 302,
    })
  })

  it("is advertised nowhere while the Guides page is switched off", async () => {
    await guide(alpha, "Best brunch", [])
    await database
      .update(customShellWorkspaces)
      .set({ settings: { pages: { "/guides": { visibility: "off" } } } })
      .where(eq(customShellWorkspaces.id, alpha.id))

    const found = await everywhere("best-brunch")
    expect(found.sitemap).toEqual([])
    expect(found.search).toEqual([])
    expect(found.feed).toEqual([])
    expect(found.shareCard).toBe(404)
  })
})
