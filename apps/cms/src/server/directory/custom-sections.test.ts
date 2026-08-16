import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { MAX_CUSTOM_SECTIONS } from "@/lib/directory/custom-fields"
import {
  createCustomSection,
  customFieldsRemovalImpact,
  customFieldUsage,
  customSectionUsage,
  deleteCustomSection,
  findCustomSection,
  listCustomSections,
  listCustomSectionSummaries,
  reorderCustomSections,
  updateCustomSection,
} from "@/server/directory/custom-sections"
import {
  createListing,
  findListing,
  updateListing,
} from "@/server/directory/listings"
import { directoryListings } from "@/server/directory/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase
let siteId: string
let otherSiteId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database)).id
  otherSiteId = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

async function wineSection() {
  const created = await createCustomSection(siteId, { name: "The wine" }, database)
  return updateCustomSection(
    siteId,
    created.id,
    {
      fields: [
        { label: "Grape", type: "text" },
        { label: "Vintage", type: "number" },
      ],
    },
    database
  )
}

describe("sections", () => {
  it("names a new section from what it is called", async () => {
    const section = await createCustomSection(
      siteId,
      { name: "The wine" },
      database
    )
    expect(section.slug).toBe("the_wine")
    expect(section.fields).toEqual([])
  })

  it("keeps the slug when the section is renamed", async () => {
    const section = await wineSection()
    const renamed = await updateCustomSection(
      siteId,
      section.id,
      { name: "About the wine" },
      database
    )
    expect(renamed.slug).toBe(section.slug)
  })

  it("refuses more sections than a site may have", async () => {
    for (let index = 0; index < MAX_CUSTOM_SECTIONS; index += 1) {
      await createCustomSection(siteId, { name: `Section ${index}` }, database)
    }
    await expect(
      createCustomSection(siteId, { name: "One too many" }, database)
    ).rejects.toThrow(/sections/)
  })

  it("puts them in the order the admin asked for", async () => {
    const first = await createCustomSection(siteId, { name: "First" }, database)
    const second = await createCustomSection(
      siteId,
      { name: "Second" },
      database
    )
    await reorderCustomSections(siteId, [second.id, first.id], database)
    expect(
      (await listCustomSections(siteId, database)).map((row) => row.name)
    ).toEqual(["Second", "First"])
  })

  it("ignores an id from another site when reordering", async () => {
    const mine = await createCustomSection(siteId, { name: "Mine" }, database)
    const theirs = await createCustomSection(
      otherSiteId,
      { name: "Theirs" },
      database
    )
    await reorderCustomSections(siteId, [theirs.id, mine.id], database)
    const other = await findCustomSection(otherSiteId, theirs.id, database)
    expect(other?.displayOrder).toBe(0)
  })

  it("does not find another site's section", async () => {
    const theirs = await createCustomSection(
      otherSiteId,
      { name: "Theirs" },
      database
    )
    expect(await findCustomSection(siteId, theirs.id, database)).toBeNull()
    await expect(
      updateCustomSection(siteId, theirs.id, { name: "Mine now" }, database)
    ).rejects.toThrow(/no longer exists/)
  })
})

describe("a listing's answers", () => {
  it("saves only what the site defines and reads it back", async () => {
    const section = await wineSection()
    const listing = await createListing(siteId, { title: "Joe's" }, database)

    await updateListing(
      siteId,
      listing.id,
      {
        customValues: {
          [section.slug]: { grape: "Nebbiolo", vintage: 1998, spy: "no" },
          made_up: { anything: "at all" },
        },
      },
      database
    )

    const saved = await findListing(siteId, listing.id, database)
    expect(saved?.customValues).toEqual({
      [section.slug]: { grape: "Nebbiolo", vintage: 1998 },
    })
  })

  it("a listing on a site with no sections is exactly as it was", async () => {
    const listing = await createListing(siteId, { title: "Plain" }, database)
    const saved = await findListing(siteId, listing.id, database)
    expect(saved?.customValues).toEqual({})
  })

  it("counts the listings that filled something in", async () => {
    const section = await wineSection()
    const filled = await createListing(siteId, { title: "Filled" }, database)
    await createListing(siteId, { title: "Empty" }, database)
    await updateListing(
      siteId,
      filled.id,
      { customValues: { [section.slug]: { grape: "Merlot" } } },
      database
    )

    expect(await customSectionUsage(siteId, section.slug, database)).toBe(1)
    expect(
      await customFieldUsage(siteId, section.slug, "grape", database)
    ).toBe(1)
    expect(
      await customFieldUsage(siteId, section.slug, "vintage", database)
    ).toBe(0)
    const [summary] = await listCustomSectionSummaries(siteId, database)
    expect(summary.listings).toBe(1)
  })

  it("says which fields a save would empty before it happens", async () => {
    const section = await wineSection()
    const listing = await createListing(siteId, { title: "Filled" }, database)
    await updateListing(
      siteId,
      listing.id,
      { customValues: { [section.slug]: { grape: "Merlot", vintage: 2001 } } },
      database
    )

    const { removed } = await customFieldsRemovalImpact(
      siteId,
      section.id,
      section.fields.filter((field) => field.key !== "vintage"),
      database
    )
    expect(removed).toEqual([{ label: "Vintage", listings: 1 }])
  })

  it("deleting a section takes its answers off every listing", async () => {
    const section = await wineSection()
    const listing = await createListing(siteId, { title: "Filled" }, database)
    await updateListing(
      siteId,
      listing.id,
      { customValues: { [section.slug]: { grape: "Merlot" } } },
      database
    )

    await deleteCustomSection(siteId, section.id, database)

    // Straight off the row, not through the reader — the reader would drop
    // the answers anyway, and the point here is that nothing is left behind
    // for a section that happens to be given the same name later.
    const [row] = await database
      .select({ customValues: directoryListings.customValues })
      .from(directoryListings)
      .where(eq(directoryListings.id, listing.id))
    expect(row.customValues).toEqual({})
  })

  it("a field the site stops defining stops being readable", async () => {
    const section = await wineSection()
    const listing = await createListing(siteId, { title: "Filled" }, database)
    await updateListing(
      siteId,
      listing.id,
      { customValues: { [section.slug]: { grape: "Merlot", vintage: 2001 } } },
      database
    )

    await updateCustomSection(
      siteId,
      section.id,
      { fields: [{ key: "grape", label: "Grape", type: "text" }] },
      database
    )

    const saved = await findListing(siteId, listing.id, database)
    expect(saved?.customValues).toEqual({ [section.slug]: { grape: "Merlot" } })
  })
})
