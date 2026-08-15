import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory } from "@/server/directory/categories"
import {
  createListing,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import {
  DIRECTORY_FEED_LIMIT,
  readDirectoryFeed,
  renderDirectoryFeedXml,
} from "@/server/directory/feed"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { directoryListings } from "@/server/directory/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import * as schema from "@/server/schema"

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

async function listing(
  siteId: string,
  input: {
    title: string
    slug: string
    status?: "draft" | "published"
    metaDescription?: string
    body?: unknown
  }
) {
  const row = await createListing(siteId, input, database)
  return updateListing(
    siteId,
    row.id,
    {
      status: input.status ?? "published",
      metaDescription: input.metaDescription,
      body: input.body,
    },
    database
  )
}

describe("one site's new-listing feed", () => {
  it("keeps the site boundary and removes a listing changed back to draft", async () => {
    const alphaListing = await listing(alpha, {
      title: "Alpha cafe",
      slug: "alpha-cafe",
    })
    await listing(beta, { title: "Beta cafe", slug: "beta-cafe" })

    expect(
      (await readDirectoryFeed(alpha, database)).map((row) => row.slug)
    ).toEqual(["alpha-cafe"])

    await updateListing(alpha, alphaListing.id, { status: "draft" }, database)

    expect(await readDirectoryFeed(alpha, database)).toEqual([])
  })

  it("uses the primary category and plain text from a linked body", async () => {
    const row = await listing(alpha, {
      title: "Linked cafe",
      slug: "linked-cafe",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Visit our " },
              {
                type: "text",
                text: "menu",
                marks: [
                  { type: "link", attrs: { href: "https://example.com" } },
                ],
              },
              { type: "text", text: ". Second sentence." },
            ],
          },
        ],
      },
    })
    const secondary = await createCategory(
      alpha,
      { name: "Bakeries", slug: "bakeries" },
      database
    )
    const primary = await createCategory(
      alpha,
      { name: "Cafes", slug: "cafes" },
      database
    )
    await setListingCategories(
      alpha,
      row.id,
      [secondary.id, primary.id],
      primary.id,
      database
    )

    const [entry] = await readDirectoryFeed(alpha, database)
    const xml = renderDirectoryFeedXml({
      siteName: "Alpha & Co",
      origin: "https://alpha.example.com",
      entries: entry ? [entry] : [],
    })

    expect(entry).toMatchObject({
      category: "Cafes",
      description: "Visit our menu.",
    })
    expect(xml).toContain("Alpha &amp; Co")
    expect(xml).toContain("<category>Cafes</category>")
    expect(xml).toContain("<description>Visit our menu.</description>")
    expect(xml).not.toContain("https://example.com")
    expect(xml).not.toContain("&lt;a")
  })

  it("returns only the twenty newest published listings", async () => {
    for (let index = 0; index < DIRECTORY_FEED_LIMIT + 2; index += 1) {
      const row = await listing(alpha, {
        title: `Listing ${String(index).padStart(2, "0")}`,
        slug: `listing-${String(index).padStart(2, "0")}`,
      })
      await database
        .update(directoryListings)
        .set({ createdAt: new Date(Date.UTC(2026, 0, index + 1)) })
        .where(eq(directoryListings.id, row.id))
    }

    const feed = await readDirectoryFeed(alpha, database)

    expect(feed).toHaveLength(DIRECTORY_FEED_LIMIT)
    expect(feed[0]?.slug).toBe("listing-21")
    expect(feed.at(-1)?.slug).toBe("listing-02")
  })

  it("does not query again for a repeated read", async () => {
    await listing(alpha, { title: "Cached cafe", slug: "cached-cafe" })
    resetPublicDirectoryCacheForTests()
    let queries = 0
    const measured = drizzle(client, {
      schema,
      logger: { logQuery: () => (queries += 1) },
    }) as unknown as TestDatabase

    await readDirectoryFeed(alpha, measured)
    const firstReadQueries = queries
    await readDirectoryFeed(alpha, measured)

    expect(firstReadQueries).toBeGreaterThan(0)
    expect(queries).toBe(firstReadQueries)
  })
})
