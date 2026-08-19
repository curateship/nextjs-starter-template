import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createCategory,
  listCategories,
} from "@/server/directory/categories"
import {
  createCustomSection,
  listCustomSections,
  updateCustomSection,
} from "@/server/directory/custom-sections"
import {
  createFrontPageSection,
  listFrontPageSections,
} from "@/server/directory/front-page-sections"
import {
  directorySettingsFor,
  saveDirectoryBrowseCategories,
} from "@/server/directory/settings"
import {
  categoriesForListing,
  createListing,
  findListing,
  listListings,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import {
  customShellWrittenPages,
  customShellWorkspaces,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import {
  copyUserWorkspace,
  parseWorkspaceSettings,
} from "@/server/people/workspaces"
import { now, uuid } from "@/server/auth/security"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

describe("copying CMS site content", () => {
  it("copies the category tree and leaves listings out by default", async () => {
    const { ownerId, sourceId, sourceRows } = await seedSourceSite()

    const copied = await copyUserWorkspace(
      ownerId,
      sourceId,
      "Gamma",
      {},
      database
    )

    expect(copied.status).toBe("draft")
    expect(parseWorkspaceSettings(copied.settings)).toMatchObject({
      logo: "https://example.test/logo.png",
      accentColor: "#123456",
      publicFooterCopyright: "Alpha Ltd",
    })
    const copiedPages = await database
      .select()
      .from(customShellWrittenPages)
      .where(eq(customShellWrittenPages.workspaceId, copied.id))
    expect(copiedPages.map((page) => page.path)).toEqual(["/about"])

    const copiedCategories = await listCategories(copied.id, database)
    expect(copiedCategories.map((category) => category.name).sort()).toEqual([
      "Food",
      "Restaurants",
    ])
    const copiedParent = copiedCategories.find(
      (category) => category.name === "Food"
    )
    const copiedChild = copiedCategories.find(
      (category) => category.name === "Restaurants"
    )
    expect(copiedChild?.parentId).toBe(copiedParent?.id)
    expect(copiedParent).toMatchObject({
      metaDescription: "Food across Alpha.",
      featuredImage: "https://images.example.test/food.jpg",
    })
    expect(copiedCategories.map((category) => category.id)).not.toContain(
      sourceRows.parentId
    )
    await expect(listListings(copied.id, {}, database)).resolves.toMatchObject({
      listings: [],
      total: 0,
    })

    await expect(
      database
        .select()
        .from(customShellWorkspaces)
        .where(eq(customShellWorkspaces.id, sourceId))
    ).resolves.toEqual([sourceRows.workspace])
    await expect(listCategories(sourceId, database)).resolves.toHaveLength(2)
    await expect(listListings(sourceId, {}, database)).resolves.toMatchObject({
      total: 1,
    })
  })

  it("copies listings and their remapped category links only when selected", async () => {
    const { ownerId, sourceId } = await seedSourceSite()

    const copied = await copyUserWorkspace(
      ownerId,
      sourceId,
      "Gamma with listings",
      {},
      database,
      undefined,
      { choices: ["listings"] }
    )

    const copiedCategories = await listCategories(copied.id, database)
    const copiedListings = await listListings(copied.id, {}, database)
    expect(copiedListings.total).toBe(1)
    expect(copiedListings.listings[0]).toMatchObject({
      title: "Joe's Diner",
      slug: "joes-diner",
      status: "published",
    })
    expect(copiedListings.listings[0]?.id).toBeTruthy()

    const links = await categoriesForListing(
      copied.id,
      copiedListings.listings[0]!.id,
      database
    )
    expect(links).toHaveLength(2)
    expect(links.every((link) =>
      copiedCategories.some((category) => category.id === link.categoryId)
    )).toBe(true)
    expect(links.filter((link) => link.isPrimary)).toHaveLength(1)
  })

  it("carries the invented fields and everything a listing holds", async () => {
    const { ownerId, sourceId } = await seedSourceSite()

    const copied = await copyUserWorkspace(
      ownerId,
      sourceId,
      "Gamma with fields",
      {},
      database,
      undefined,
      { choices: ["listings"] }
    )

    const sections = await listCustomSections(copied.id, database)
    expect(sections).toHaveLength(1)
    expect(sections[0]?.name).toBe("The wine")

    const { listings } = await listListings(copied.id, {}, database)
    const listing = await findListing(copied.id, listings[0]!.id, database)
    expect(listing?.customValues).toEqual({
      [sections[0]!.slug]: { grape: "Nebbiolo" },
    })
    expect(listing?.gallery).toEqual(["https://images.example.test/one.jpg"])
    expect(listing?.hours.monday).toEqual({ open: "09:00", close: "17:00" })
    expect(listing?.latitude).toBe(40.7)
    expect(listing?.longitude).toBe(-74)
  })

  it("carries the home page rows, pointed at the copy's own categories", async () => {
    const { ownerId, sourceId } = await seedSourceSite()

    const copied = await copyUserWorkspace(
      ownerId,
      sourceId,
      "Gamma with rows",
      {},
      database
    )

    const rows = await listFrontPageSections(copied.id, database)
    expect(rows.map((row) => row.heading)).toEqual([
      "New this week",
      "Start somewhere",
      "Restaurants",
    ])
    expect(rows[0]).toMatchObject({ categoryId: null, sort: "newest" })

    const copiedCategories = await listCategories(copied.id, database)
    const restaurants = copiedCategories.find(
      (category) => category.name === "Restaurants"
    )
    // The copy's own category, not the original's — a row that still pointed at
    // the source site would filter to a category this site cannot see.
    expect(rows[2]?.categoryId).toBe(restaurants?.id)
    expect(rows[2]).toMatchObject({ sort: "rating", layout: "list" })

    // The hand-picked cards are re-pointed too, and keep their order. Ids left
    // pointing at the original would filter to categories this site cannot see,
    // and the copied row would silently draw nothing.
    const food = copiedCategories.find((category) => category.name === "Food")
    expect(rows[1]).toMatchObject({
      kind: "categories",
      categorySource: "picked",
      pickedCategoryIds: [restaurants?.id, food?.id],
    })

    // And the browse page's own row of cards, the same way.
    const settings = await directorySettingsFor(copied.id, database)
    expect(settings).toMatchObject({
      browseCategoriesEnabled: true,
      browseCategorySource: "picked",
      browsePickedCategoryIds: [food?.id],
    })
  })
})

async function seedSourceSite() {
  const at = now()
  const owner = await insertUser(database, { role: "admin" })
  const workspace = await insertWorkspace(database, {
    userId: owner.id,
    name: "Alpha",
    settings: {
      logo: "https://example.test/logo.png",
      accentColor: "#123456",
      publicFooterCopyright: "Alpha Ltd",
    },
  })
  await database.insert(customShellWrittenPages).values({
    id: uuid(),
    workspaceId: workspace.id,
    path: "/about",
    title: "About Alpha",
    body: { type: "doc", content: [] },
    createdAt: at,
    updatedAt: at,
  })

  const parent = await createCategory(
    workspace.id,
    {
      name: "Food",
      metaDescription: "Food across Alpha.",
      featuredImage: "https://images.example.test/food.jpg",
    },
    database
  )
  const child = await createCategory(
    workspace.id,
    { name: "Restaurants", parentId: parent.id },
    database
  )
  const section = await createCustomSection(
    workspace.id,
    { name: "The wine" },
    database
  )
  const wine = await updateCustomSection(
    workspace.id,
    section.id,
    { fields: [{ label: "Grape", type: "text" }] },
    database
  )

  const listing = await createListing(
    workspace.id,
    { title: "Joe's Diner" },
    database
  )
  await updateListing(
    workspace.id,
    listing.id,
    {
      status: "published",
      // The rich fields as well, because a copy that quietly dropped them
      // used to look like a listing somebody had emptied on purpose.
      gallery: ["https://images.example.test/one.jpg"],
      hours: { monday: { open: "09:00", close: "17:00" } },
      latitude: 40.7,
      longitude: -74,
      customValues: { [wine.slug]: { grape: "Nebbiolo" } },
    },
    database
  )
  await createFrontPageSection(
    workspace.id,
    { heading: "New this week", listingCount: 3 },
    database
  )
  await createFrontPageSection(
    workspace.id,
    {
      heading: "Start somewhere",
      kind: "categories",
      categorySource: "picked",
      pickedCategoryIds: [child.id, parent.id],
    },
    database
  )
  await saveDirectoryBrowseCategories(
    workspace.id,
    {
      browseCategoriesEnabled: true,
      browseCategorySource: "picked",
      browsePickedCategoryIds: [parent.id],
    },
    database
  )
  await createFrontPageSection(
    workspace.id,
    {
      heading: "Restaurants",
      categoryId: child.id,
      sort: "rating",
      layout: "list",
    },
    database
  )
  await setListingCategories(
    workspace.id,
    listing.id,
    [parent.id, child.id],
    child.id,
    database
  )

  return {
    ownerId: owner.id,
    sourceId: workspace.id,
    sourceRows: { workspace, parentId: parent.id },
  }
}
