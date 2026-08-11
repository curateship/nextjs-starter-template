import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import {
  createListing,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import { directorySitemapEntries } from "@/server/directory/sitemap"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

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

async function listing(
  workspaceId: string,
  title: string,
  status: "draft" | "published"
) {
  const row = await createListing(
    workspaceId,
    { title, slug: title.toLowerCase().replaceAll(" ", "-") },
    database
  )
  if (status === "draft") return row
  return updateListing(workspaceId, row.id, { status }, database)
}

describe("directory sitemap entries", () => {
  it("keeps drafts and the other site's content out", async () => {
    const alphaPublished = await listing(alpha, "Alpha open", "published")
    const alphaDraft = await listing(alpha, "Alpha draft", "draft")
    const betaPublished = await listing(beta, "Beta open", "published")

    const alphaOpenCategory = await createCategory(
      alpha,
      { name: "Alpha food", slug: "alpha-food" },
      database
    )
    const alphaDraftCategory = await createCategory(
      alpha,
      { name: "Draft food", slug: "draft-food" },
      database
    )
    const betaCategory = await createCategory(
      beta,
      { name: "Beta food", slug: "beta-food" },
      database
    )

    await setListingCategories(
      alpha,
      alphaPublished.id,
      [alphaOpenCategory.id],
      alphaOpenCategory.id,
      database
    )
    await setListingCategories(
      alpha,
      alphaDraft.id,
      [alphaDraftCategory.id],
      alphaDraftCategory.id,
      database
    )
    await setListingCategories(
      beta,
      betaPublished.id,
      [betaCategory.id],
      betaCategory.id,
      database
    )

    const paths = (await directorySitemapEntries(alpha, database)).map(
      (entry) => entry.path
    )

    expect(paths).toEqual([
      "/directory/alpha-open",
      "/directory/category/alpha-food",
    ])
    expect(paths).not.toContain("/directory/alpha-draft")
    expect(paths).not.toContain("/directory/category/draft-food")
    expect(paths).not.toContain("/directory/beta-open")
    expect(paths).not.toContain("/directory/category/beta-food")
  })
})
