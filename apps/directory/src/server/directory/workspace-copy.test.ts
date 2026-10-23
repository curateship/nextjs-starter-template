import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createCategory, listCategories } from "@/server/directory/categories"
import {
  createCustomSection,
  listCustomSections,
  updateCustomSection,
} from "@/server/directory/custom-sections"
import {
  directorySettingsFor,
  saveDirectoryBrowseCategories,
  saveDirectoryNeighbourhoodCategory,
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
  customShellPageBlocks,
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

/** One of this app's rows, in the one shape the shell stores. */
function appRow(
  appKind: string,
  heading: string,
  settings: Record<string, unknown>
) {
  return {
    id: `front-page-row-${heading.toLowerCase().replaceAll(" ", "-")}`,
    kind: "app",
    appKind,
    heading,
    intro: "",
    settings,
    layout: "wide",
    alignment: "inherit",
    hidden: false,
    device: "all",
  }
}

/**
 * Writes the source site's front page, which the shell's copy carries over.
 *
 * The blocks live in `page_blocks`, keyed by site and address, since the shell's
 * 5 Oct 2026 merge. They were fields inside the workspace's settings before
 * that.
 */
async function saveSourceFrontPageRows(
  workspaceId: string,
  rows: ReturnType<typeof appRow>[]
) {
  const at = now()
  await database.insert(customShellPageBlocks).values(
    rows.map((row, position) => ({
      id: row.id,
      workspaceId,
      path: "/",
      position,
      kind: row.kind,
      appKind: row.appKind,
      // The jsonb column is the whole block bar its id, kind and appKind, so
      // this app's own fields stay nested under `settings`, exactly as the
      // shell's own writer stores them.
      settings: {
        heading: row.heading,
        intro: row.intro,
        layout: row.layout,
        alignment: row.alignment,
        hidden: row.hidden,
        device: row.device,
        settings: row.settings,
      },
      createdAt: at,
      updatedAt: at,
    }))
  )
}

/** This app's own blocks on a site's front page, in the order they are drawn. */
async function frontPageRowsOf(workspaceId: string) {
  const blocks = await database
    .select({
      position: customShellPageBlocks.position,
      settings: customShellPageBlocks.settings,
    })
    .from(customShellPageBlocks)
    .where(eq(customShellPageBlocks.workspaceId, workspaceId))
  return blocks
    .sort((a, b) => a.position - b.position)
    .map((block) => {
      const saved = (block.settings ?? {}) as Record<string, unknown>
      return {
        heading: String(saved.heading ?? ""),
        settings: (saved.settings ?? {}) as Record<string, unknown>,
      }
    })
}

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
      publicTheme: { brandColor: "#123456" },
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
    expect(
      links.every((link) =>
        copiedCategories.some((category) => category.id === link.categoryId)
      )
    ).toBe(true)
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

  /**
   * The front page itself is the shell's and comes across with the site's
   * settings. What this app owns is the category inside one of its own rows,
   * and an id left pointing at the source site would filter to a category the
   * copy cannot see, so the row would come back empty and vanish.
   */
  it("points the copied front page rows at the copy's own categories", async () => {
    const { ownerId, sourceId } = await seedSourceSite()

    const copied = await copyUserWorkspace(
      ownerId,
      sourceId,
      "Gamma with rows",
      {},
      database
    )

    const rows = await frontPageRowsOf(copied.id)
    expect(rows.map((row) => row.heading)).toEqual([
      "New this week",
      "Start somewhere",
      "Restaurants",
    ])
    expect(rows[0]?.settings).toMatchObject({
      categoryId: null,
      sort: "newest",
    })

    const copiedCategories = await listCategories(copied.id, database)
    const restaurants = copiedCategories.find(
      (category) => category.name === "Restaurants"
    )
    expect(rows[2]?.settings).toMatchObject({
      categoryId: restaurants?.id,
      sort: "rating",
      layout: "list",
    })

    // The hand-picked cards are re-pointed too, and keep their order.
    const food = copiedCategories.find((category) => category.name === "Food")
    expect(rows[1]?.settings).toMatchObject({
      source: "picked",
      pickedCategoryIds: [restaurants?.id, food?.id],
    })

    // And the browse page's own row of cards, the same way.
    const settings = await directorySettingsFor(copied.id, database)
    expect(settings).toMatchObject({
      browseCategoriesEnabled: true,
      browseCategorySource: "picked",
      browsePickedCategoryIds: [food?.id],
      // The copy's own category again. Pointed at the original's, the copied
      // site would label none of its cards.
      neighbourhoodCategoryId: food?.id,
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
    // A written page's words are blocks in `page_blocks` since the shell's
    // `0087_custom_shell_written_pages_as_blocks` migration, so the page row
    // itself carries no body.
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
  await saveSourceFrontPageRows(workspace.id, [
    appRow("listings", "New this week", {
      categoryId: null,
      sort: "newest",
      count: 3,
      layout: "grid",
    }),
    appRow("categories", "Start somewhere", {
      source: "picked",
      pickedCategoryIds: [child.id, parent.id],
      count: 8,
    }),
    appRow("listings", "Restaurants", {
      categoryId: child.id,
      sort: "rating",
      count: 8,
      layout: "list",
    }),
  ])
  await saveDirectoryBrowseCategories(
    workspace.id,
    {
      browseCategoriesEnabled: true,
      browseCategorySource: "picked",
      browsePickedCategoryIds: [parent.id],
    },
    database
  )
  await saveDirectoryNeighbourhoodCategory(workspace.id, parent.id, database)
  await setListingCategories(
    workspace.id,
    listing.id,
    [parent.id, child.id],
    child.id,
    database
  )

  // Re-read, because the front page rows above were written straight onto the
  // row after it was made. The test that proves the source is only read
  // compares against this, so it has to be the row as it now stands.
  const [saved] = await database
    .select()
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, workspace.id))

  return {
    ownerId: owner.id,
    sourceId: workspace.id,
    sourceRows: { workspace: saved ?? workspace, parentId: parent.id },
  }
}
