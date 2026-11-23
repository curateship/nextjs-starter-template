import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readGuidesRow } from "@/server/directory/front-page-row-readers"
import {
  createGuide,
  deleteGuides,
  updateGuide,
} from "@/server/directory/guides"
import { createListing, updateListing } from "@/server/directory/listings"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { directoryGuides } from "@/server/directory/schema"
import { customShellWorkspaces } from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The "Latest guides" front page row: the newest published guides as cards,
 * and nothing at all when there are none to show.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

/** A published guide on a site, holding these listings. */
async function guide(site: string, title: string, listingIds: string[] = []) {
  const made = await createGuide(site, { title }, database)
  return updateGuide(
    site,
    made.id,
    { status: "published", intro: `About ${title}.`, listingIds },
    database
  )
}

async function row(settings: Record<string, unknown>, site = alpha) {
  resetPublicDirectoryCacheForTests()
  return readGuidesRow(site, settings, database)
}

const slugs = (rows: { slug: string }[] | undefined) =>
  (rows ?? []).map((one) => one.slug)

describe("the Latest guides row", () => {
  it("shows this site's newest published guides, up to the count, with a button to all of them", async () => {
    // Each published on its own day, so the order cannot hang on two saves
    // landing in the same millisecond.
    const days = ["2099-01-01", "2099-01-02", "2099-01-03"]
    for (const [index, title] of ["Oldest", "Middle", "Newest"].entries()) {
      const made = await guide(alpha, title)
      await database
        .update(directoryGuides)
        .set({ publishedAt: new Date(`${days[index]}T12:00:00Z`) })
        .where(eq(directoryGuides.id, made.id))
    }
    await guide(beta, "Elsewhere")

    const data = await row({ count: 2 })
    expect(slugs(data?.guides)).toEqual(["newest", "middle"])
    expect(data?.action).toEqual({ label: "Browse guides", href: "/guides" })
  })

  it("counts only the published places in each guide", async () => {
    const shown = await createListing(alpha, { title: "Shown" }, database)
    await updateListing(alpha, shown.id, { status: "published" }, database)
    const hidden = await createListing(alpha, { title: "Hidden" }, database)
    await guide(alpha, "Brunch", [shown.id, hidden.id])

    const data = await row({})
    expect(data?.guides.map((card) => [card.title, card.places])).toEqual([
      ["Brunch", 1],
    ])
  })

  it("leaves out a draft guide, and a deleted one", async () => {
    const kept = await guide(alpha, "Kept")
    const draft = await guide(alpha, "Draft")
    const gone = await guide(alpha, "Gone")
    await updateGuide(alpha, draft.id, { status: "draft" }, database)
    await deleteGuides(alpha, [gone.id], database)

    expect(slugs((await row({}))?.guides)).toEqual([kept.slug])
  })

  it("is left off the page while there are no published guides", async () => {
    expect(await row({})).toBeNull()
    await createGuide(alpha, { title: "Only a draft" }, database)
    expect(await row({})).toBeNull()
  })

  it("is left off while the Guides page is switched off", async () => {
    await guide(alpha, "Brunch")
    await database
      .update(customShellWorkspaces)
      .set({ settings: { pages: { "/guides": { visibility: "off" } } } })
      .where(eq(customShellWorkspaces.id, alpha))

    expect(await row({})).toBeNull()
  })
})
