import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createCategory,
  listCategories,
} from "@/server/directory/categories"
import {
  categoriesForListing,
  createListing,
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
    { name: "Food" },
    database
  )
  const child = await createCategory(
    workspace.id,
    { name: "Restaurants", parentId: parent.id },
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
    { status: "published" },
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
