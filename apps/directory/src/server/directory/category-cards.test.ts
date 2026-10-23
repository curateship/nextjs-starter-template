import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  MAX_DIRECTORY_CATEGORY_CARDS,
  type DirectoryCategoryChoice,
} from "@/lib/directory/category-cards"
import { uuid } from "@/server/auth/security"
import {
  readCategoryCardsForChoices,
  readDirectoryCategoryCards,
} from "@/server/directory/category-cards"
import {
  categories,
  categoryRelationships,
  directoryListings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"
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

async function insertCategory(
  name: string,
  options: {
    workspaceId?: string
    parentId?: string
    displayOrder?: number
  } = {}
) {
  const id = uuid()
  const at = new Date()
  await database.insert(categories).values({
    id,
    workspaceId: options.workspaceId ?? siteId,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    parentId: options.parentId,
    displayOrder: options.displayOrder ?? 0,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

async function publish(
  title: string,
  categoryIds: string[],
  options: { workspaceId?: string; status?: "draft" | "published" } = {}
) {
  const workspaceId = options.workspaceId ?? siteId
  const id = uuid()
  const at = new Date()
  await database.insert(directoryListings).values({
    id,
    workspaceId,
    title,
    slug: `${title.toLowerCase().replaceAll(" ", "-")}-${id.slice(0, 4)}`,
    status: options.status ?? "published",
    contactLinks: { address: "", menuLinks: [], socialLinks: [] },
    body: { type: "doc", content: [] },
    createdAt: at,
    updatedAt: at,
  })
  for (const categoryId of categoryIds) {
    await database.insert(categoryRelationships).values({
      id: uuid(),
      workspaceId,
      categoryId,
      contentType: LISTING_CONTENT_TYPE,
      contentId: id,
      isPrimary: categoryIds[0] === categoryId,
      createdAt: at,
    })
  }
  return id
}

function topLevel(
  limit = MAX_DIRECTORY_CATEGORY_CARDS
): DirectoryCategoryChoice {
  return { source: "top-level", pickedCategoryIds: [], limit }
}

describe("a row of category cards", () => {
  it("counts everything nested beneath a category, each listing once", async () => {
    const eat = await insertCategory("Eat", { displayOrder: 0 })
    const italian = await insertCategory("Italian", {
      parentId: eat,
      displayOrder: 0,
    })
    const pizza = await insertCategory("Pizza", {
      parentId: italian,
      displayOrder: 0,
    })

    await publish("Direct", [eat])
    await publish("One down", [italian])
    await publish("Two down", [pizza])
    // Filed at two levels at once: counted once, not twice.
    await publish("Both", [eat, pizza])

    const cards = await readDirectoryCategoryCards(
      siteId,
      topLevel(),
      database
    )
    expect(cards).toMatchObject([{ name: "Eat", listingCount: 4 }])
  })

  it("leaves out a category with nothing published under it", async () => {
    const eat = await insertCategory("Eat", { displayOrder: 0 })
    await insertCategory("Nightlife", { displayOrder: 1 })
    const drafts = await insertCategory("Drafts only", { displayOrder: 2 })
    await publish("Cafe", [eat])
    await publish("Not yet", [drafts], { status: "draft" })

    const cards = await readDirectoryCategoryCards(siteId, topLevel(), database)
    expect(cards.map((card) => card.name)).toEqual(["Eat"])
  })

  it("comes back empty when every category is empty", async () => {
    await insertCategory("Nightlife")
    expect(
      await readDirectoryCategoryCards(siteId, topLevel(), database)
    ).toEqual([])
  })

  it("shows only top-level categories, never a child on its own", async () => {
    const eat = await insertCategory("Eat", { displayOrder: 0 })
    const italian = await insertCategory("Italian", { parentId: eat })
    await publish("Trattoria", [italian])

    const cards = await readDirectoryCategoryCards(siteId, topLevel(), database)
    expect(cards.map((card) => card.name)).toEqual(["Eat"])
  })

  it("keeps hand-picked categories in the order they were chosen", async () => {
    const eat = await insertCategory("Eat", { displayOrder: 0 })
    const stay = await insertCategory("Stay", { displayOrder: 1 })
    const shop = await insertCategory("Shop", { displayOrder: 2 })
    await publish("Cafe", [eat])
    await publish("Hotel", [stay])
    await publish("Store", [shop])

    const cards = await readDirectoryCategoryCards(
      siteId,
      {
        source: "picked",
        pickedCategoryIds: [shop, eat, stay],
        limit: MAX_DIRECTORY_CATEGORY_CARDS,
      },
      database
    )
    expect(cards.map((card) => card.name)).toEqual(["Shop", "Eat", "Stay"])
  })

  it("picks a child category when it is chosen by hand", async () => {
    const eat = await insertCategory("Eat")
    const italian = await insertCategory("Italian", { parentId: eat })
    await publish("Trattoria", [italian])

    const cards = await readDirectoryCategoryCards(
      siteId,
      { source: "picked", pickedCategoryIds: [italian], limit: 12 },
      database
    )
    expect(cards).toMatchObject([{ name: "Italian", listingCount: 1 }])
  })

  it("ignores a chosen category that was deleted or belongs elsewhere", async () => {
    const eat = await insertCategory("Eat")
    const theirs = await insertCategory("Theirs", {
      workspaceId: otherSiteId,
    })
    await publish("Cafe", [eat])
    await publish("Theirs", [theirs], { workspaceId: otherSiteId })

    const cards = await readDirectoryCategoryCards(
      siteId,
      {
        source: "picked",
        pickedCategoryIds: [theirs, eat, uuid()],
        limit: 12,
      },
      database
    )
    expect(cards.map((card) => card.name)).toEqual(["Eat"])
  })

  it("caps the row, counting only cards a visitor can use", async () => {
    const full = await insertCategory("Full", { displayOrder: 0 })
    await insertCategory("Empty", { displayOrder: 1 })
    const second = await insertCategory("Second", { displayOrder: 2 })
    await publish("One", [full])
    await publish("Two", [second])

    // The empty one is dropped before the cap applies, so a limit of one still
    // leaves a usable card rather than being spent on a category nobody can open.
    const cards = await readDirectoryCategoryCards(
      siteId,
      { source: "top-level", pickedCategoryIds: [], limit: 1 },
      database
    )
    expect(cards.map((card) => card.name)).toEqual(["Full"])
  })

  it("answers several rows at once in two queries", async () => {
    const eat = await insertCategory("Eat", { displayOrder: 0 })
    const stay = await insertCategory("Stay", { displayOrder: 1 })
    await publish("Cafe", [eat])
    await publish("Hotel", [stay])

    let queries = 0
    const counted = new Proxy(database, {
      get(target, property) {
        const value = Reflect.get(target, property) as unknown
        if (property === "execute" || property === "select") {
          return (...args: unknown[]) => {
            queries += 1
            return (value as (...inner: unknown[]) => unknown).apply(
              target,
              args
            )
          }
        }
        return typeof value === "function" ? value.bind(target) : value
      },
    }) as TestDatabase

    const rows = await readCategoryCardsForChoices(
      siteId,
      [
        topLevel(),
        { source: "picked", pickedCategoryIds: [stay], limit: 12 },
        { source: "picked", pickedCategoryIds: [eat, stay], limit: 12 },
      ],
      counted
    )

    expect(queries).toBe(2)
    expect(rows.map((cards) => cards.map((card) => card.name))).toEqual([
      ["Eat", "Stay"],
      ["Stay"],
      ["Eat", "Stay"],
    ])
  })

  it("asks nothing at all when a hand-picked row has chosen nothing", async () => {
    let queries = 0
    const counted = new Proxy(database, {
      get(target, property) {
        const value = Reflect.get(target, property) as unknown
        if (property === "execute" || property === "select") {
          return (...args: unknown[]) => {
            queries += 1
            return (value as (...inner: unknown[]) => unknown).apply(
              target,
              args
            )
          }
        }
        return typeof value === "function" ? value.bind(target) : value
      },
    }) as TestDatabase

    expect(
      await readDirectoryCategoryCards(
        siteId,
        { source: "picked", pickedCategoryIds: [], limit: 12 },
        counted
      )
    ).toEqual([])
    expect(queries).toBe(0)
  })
})
