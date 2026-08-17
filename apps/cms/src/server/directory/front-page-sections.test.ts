import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { MAX_DIRECTORY_FRONT_PAGE_SECTIONS } from "@/lib/directory/front-page"
import { uuid } from "@/server/auth/security"
import {
  createFrontPageSection,
  deleteFrontPageSection,
  listFrontPageSections,
  reorderFrontPageSections,
  updateFrontPageSection,
} from "@/server/directory/front-page-sections"
import { categories } from "@/server/directory/schema"
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
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
  otherSiteId = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  await client.close()
})

async function insertCategory(workspaceId: string, slug: string) {
  const id = uuid()
  const at = new Date()
  await database.insert(categories).values({
    id,
    workspaceId,
    name: slug,
    slug,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

describe("home page rows", () => {
  it("adds a row at the bottom with the choices it was given", async () => {
    const cafes = await insertCategory(siteId, "cafes")
    await createFrontPageSection(siteId, { heading: "First" }, database)
    const second = await createFrontPageSection(
      siteId,
      {
        heading: "  Cafés  ",
        intro: "  The good ones.  ",
        categoryId: cafes,
        sort: "rating",
        listingCount: 3,
        layout: "list",
      },
      database
    )

    expect(second).toMatchObject({
      displayOrder: 1,
      heading: "Cafés",
      intro: "The good ones.",
      categoryId: cafes,
      categorySlug: "cafes",
      categoryName: "cafes",
      sort: "rating",
      listingCount: 3,
      layout: "list",
    })
  })

  it("refuses a row with no heading", async () => {
    await expect(
      createFrontPageSection(siteId, { heading: "   " }, database)
    ).rejects.toThrow("Give the row a heading.")
    expect(await listFrontPageSections(siteId, database)).toHaveLength(0)
  })

  it("refuses the seventh row before it is saved", async () => {
    for (let index = 0; index < MAX_DIRECTORY_FRONT_PAGE_SECTIONS; index += 1) {
      await createFrontPageSection(siteId, { heading: `Row ${index}` }, database)
    }

    await expect(
      createFrontPageSection(siteId, { heading: "One too many" }, database)
    ).rejects.toThrow(/6 rows of listings/)
    expect(await listFrontPageSections(siteId, database)).toHaveLength(
      MAX_DIRECTORY_FRONT_PAGE_SECTIONS
    )
  })

  it("refuses more than twelve listings in a row", async () => {
    await expect(
      createFrontPageSection(
        siteId,
        { heading: "Too many", listingCount: 13 },
        database
      )
    ).rejects.toThrow(/between 1 and 12/)
  })

  it("refuses a category that belongs to another site", async () => {
    const theirs = await insertCategory(otherSiteId, "theirs")
    await expect(
      createFrontPageSection(
        siteId,
        { heading: "Not mine", categoryId: theirs },
        database
      )
    ).rejects.toThrow("That category is not on this site.")
  })

  it("edits only what it was handed", async () => {
    const row = await createFrontPageSection(
      siteId,
      { heading: "Newest", listingCount: 4 },
      database
    )
    const saved = await updateFrontPageSection(
      siteId,
      row.id,
      { heading: "New this week" },
      database
    )
    expect(saved).toMatchObject({
      heading: "New this week",
      listingCount: 4,
      sort: "newest",
    })
  })

  it("will not edit or delete another site's row", async () => {
    const row = await createFrontPageSection(siteId, { heading: "Mine" }, database)
    await expect(
      updateFrontPageSection(otherSiteId, row.id, { heading: "Stolen" }, database)
    ).rejects.toThrow("That row no longer exists.")
    await expect(
      deleteFrontPageSection(otherSiteId, row.id, database)
    ).rejects.toThrow("That row no longer exists.")
    expect((await listFrontPageSections(siteId, database))[0]?.heading).toBe(
      "Mine"
    )
  })

  it("saves an order that survives a fresh read", async () => {
    const first = await createFrontPageSection(siteId, { heading: "A" }, database)
    const second = await createFrontPageSection(siteId, { heading: "B" }, database)
    const third = await createFrontPageSection(siteId, { heading: "C" }, database)

    await reorderFrontPageSections(
      siteId,
      [third.id, first.id, second.id],
      database
    )
    expect(
      (await listFrontPageSections(siteId, database)).map((row) => row.heading)
    ).toEqual(["C", "A", "B"])
  })

  it("ignores ids from another site when reordering", async () => {
    const first = await createFrontPageSection(siteId, { heading: "A" }, database)
    const second = await createFrontPageSection(siteId, { heading: "B" }, database)
    const theirs = await createFrontPageSection(
      otherSiteId,
      { heading: "Theirs" },
      database
    )

    await reorderFrontPageSections(
      siteId,
      [theirs.id, second.id, first.id],
      database
    )
    expect(
      (await listFrontPageSections(siteId, database)).map((row) => row.heading)
    ).toEqual(["B", "A"])
    expect((await listFrontPageSections(otherSiteId, database))[0]).toMatchObject(
      { heading: "Theirs", displayOrder: 0 }
    )
  })

  it("empties a row's filter when its category is deleted, keeping the row", async () => {
    const cafes = await insertCategory(siteId, "cafes")
    const row = await createFrontPageSection(
      siteId,
      { heading: "Cafés", categoryId: cafes },
      database
    )
    await database.delete(categories).where(eq(categories.id, cafes))

    const [saved] = await listFrontPageSections(siteId, database)
    expect(saved).toMatchObject({
      id: row.id,
      heading: "Cafés",
      categoryId: null,
      categorySlug: null,
    })
  })

})
