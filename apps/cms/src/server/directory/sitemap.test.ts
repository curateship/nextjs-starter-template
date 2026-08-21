import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import {
  createListing,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  DIRECTORY_SITEMAP_CHUNK_SIZE,
  directoryListingChunkEntries,
  directorySitemapChunkFiles,
  directorySitemapEntries,
} from "@/server/directory/sitemap"
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
  resetPublicDirectoryCacheForTests()
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
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

/**
 * Enough listings to need two numbered files, written in one statement.
 *
 * The point of the whole feature is what happens either side of the five
 * thousandth address, and there is no way to see that without really having
 * that many.
 */
async function bulkListings(workspaceId: string, count: number) {
  await database.execute(sql`
    INSERT INTO directory_listings
      (id, workspace_id, title, slug, status, contact_links, body,
       created_at, updated_at)
    SELECT
      left(${workspaceId}, 8) || '-' || lpad(n::text, 10, '0'),
      ${workspaceId},
      'Listing ' || n,
      'listing-' || lpad(n::text, 10, '0'),
      'published',
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    FROM generate_series(1, ${count}) AS n
  `)
}

describe("the flat rows a site adds to the shell's sitemap", () => {
  it("is its categories, and never a draft or another site's", async () => {
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

    expect(paths).toEqual(["/directory/category/alpha-food"])
    expect(paths).not.toContain("/directory/category/draft-food")
    expect(paths).not.toContain("/directory/category/beta-food")
    // Listings are in the numbered files now, never in the flat one.
    expect(paths).not.toContain("/directory/alpha-open")
  })
})

describe("the numbered files an index points at", () => {
  /**
   * One test, because every one of these builds a whole database first. The
   * order is the story: nothing published, then a little, then either side of
   * the file that does not exist.
   */
  it("appears only once there is something to put in it", async () => {
    await listing(alpha, "Alpha draft", "draft")

    // No files means the shell keeps serving one flat /sitemap.xml, which is
    // what every ordinary small site should get.
    expect(await directorySitemapChunkFiles(alpha, database)).toEqual([])
    // File zero is still a real, empty, valid file rather than a 404.
    expect(await directoryListingChunkEntries(alpha, 0, database)).toEqual([])

    await listing(alpha, "Alpha open", "published")
    const newest = await listing(alpha, "Alpha two", "published")

    const files = await directorySitemapChunkFiles(alpha, database)
    expect(files.map((file) => file.path)).toEqual(["/directory-sitemaps/0"])
    expect(files[0]?.updatedAt?.toISOString()).toBe(
      newest.updatedAt.toISOString()
    )

    // Publishing cleared this site's public cache, so this read is fresh.
    expect(
      (await directoryListingChunkEntries(alpha, 0, database))?.map(
        (entry) => entry.path
      )
    ).toEqual(["/directory/alpha-open", "/directory/alpha-two"])

    // Anything past the last file, and anything that is not a file number.
    expect(await directoryListingChunkEntries(alpha, 1, database)).toBeNull()
    expect(await directoryListingChunkEntries(alpha, 42, database)).toBeNull()
    expect(await directoryListingChunkEntries(alpha, -1, database)).toBeNull()
    expect(await directoryListingChunkEntries(alpha, 1.5, database)).toBeNull()

    // A crawler asking for nonsense gets a 404, not a fallen-over server. Five
    // thousand times a nineteen-digit number is more than the database can
    // count to, and it says so by erroring rather than by finding nothing.
    expect(
      await directoryListingChunkEntries(alpha, Number("9999999999999999999"), database)
    ).toBeNull()
  })

  it("splits at five thousand and serves each part", async () => {
    await bulkListings(alpha, DIRECTORY_SITEMAP_CHUNK_SIZE + 1)

    const files = await directorySitemapChunkFiles(alpha, database)
    expect(files.map((file) => file.path)).toEqual([
      "/directory-sitemaps/0",
      "/directory-sitemaps/1",
    ])

    const first = await directoryListingChunkEntries(alpha, 0, database)
    const second = await directoryListingChunkEntries(alpha, 1, database)

    expect(first).toHaveLength(DIRECTORY_SITEMAP_CHUNK_SIZE)
    expect(second).toHaveLength(1)
    expect(first?.[0]?.path).toBe("/directory/listing-0000000001")
    expect(second?.[0]?.path).toBe(
      `/directory/listing-${String(DIRECTORY_SITEMAP_CHUNK_SIZE + 1).padStart(10, "0")}`
    )

    // No address is in two files and none is missed.
    const everything = new Set([
      ...(first ?? []).map((entry) => entry.path),
      ...(second ?? []).map((entry) => entry.path),
    ])
    expect(everything.size).toBe(DIRECTORY_SITEMAP_CHUNK_SIZE + 1)

    expect(await directoryListingChunkEntries(alpha, 2, database)).toBeNull()
  })

  it("never lets one site's listing into another site's file", async () => {
    await listing(alpha, "Alpha open", "published")
    await listing(beta, "Beta open", "published")

    const alphaPaths = (
      (await directoryListingChunkEntries(alpha, 0, database)) ?? []
    ).map((entry) => entry.path)
    const betaPaths = (
      (await directoryListingChunkEntries(beta, 0, database)) ?? []
    ).map((entry) => entry.path)

    expect(alphaPaths).toEqual(["/directory/alpha-open"])
    expect(betaPaths).toEqual(["/directory/beta-open"])
  })
})
