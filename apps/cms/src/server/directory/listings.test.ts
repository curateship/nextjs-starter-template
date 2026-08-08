import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { menuLinkHref } from "@/lib/directory/contact-links"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"
import { createCategory } from "@/server/directory/categories"
import {
  categoriesForListing,
  createListing,
  deleteListings,
  duplicateListing,
  findListing,
  listingDeleteImpact,
  listListings,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"

/**
 * Listings are plain records with two promises: an address only ever belongs
 * to one listing, and nothing unsafe survives a save — a poisoned link or a
 * pasted script goes in and comes back out as nothing.
 */

let client: PGlite
let database: TestDatabase

/**
 * The same database, except that inserting blows up — the way a connection
 * dropping mid-write would. A proxy rather than a copy: drizzle keeps its
 * methods on the prototype, so a spread of it has none of them.
 *
 * Breaks inserts both directly and inside a transaction on purpose, so the
 * test it serves fails for the right reason if the transaction is ever taken
 * back out.
 */
function breakInserts(real: TestDatabase): TestDatabase {
  const explode = () => {
    throw new Error("the database went away")
  }

  const wrap = (target: object): object =>
    new Proxy(target, {
      get(current, prop) {
        if (prop === "insert") return explode
        if (prop === "transaction") {
          return (work: (tx: unknown) => Promise<unknown>) =>
            (current as TestDatabase).transaction((tx) =>
              work(wrap(tx as object))
            )
        }
        const value = Reflect.get(current, prop) as unknown
        return typeof value === "function" ? value.bind(current) : value
      },
    })

  return wrap(real) as TestDatabase
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

describe("creating and addressing", () => {
  it("derives the address from the title and starts as a draft", async () => {
    const listing = await createListing({ title: "Joe's Diner & Grill" }, database)
    expect(listing.slug).toBe("joes-diner-grill")
    expect(listing.status).toBe("draft")
  })

  it("numbers a name clash instead of failing the create", async () => {
    await createListing({ title: "Joes Diner" }, database)
    const second = await createListing({ title: "Joes Diner" }, database)
    expect(second.slug).toBe("joes-diner-2")
  })

  it("refuses a hand-picked address another listing already uses", async () => {
    await createListing({ title: "First", slug: "the-spot" }, database)
    await expect(
      createListing({ title: "Second", slug: "the-spot" }, database)
    ).rejects.toThrow("already uses the address the-spot")
    await expect(
      updateListing(
        (await createListing({ title: "Third" }, database)).id,
        { slug: "the-spot" },
        database
      )
    ).rejects.toThrow("already uses the address the-spot")
  })

  it("refuses an address that is not one", async () => {
    await expect(
      createListing({ title: "X", slug: "Not A Slug!" }, database)
    ).rejects.toThrow("lowercase letters")
  })
})

describe("what a save may contain", () => {
  it("stores a poisoned link as typed but never makes it followable", async () => {
    const listing = await createListing({ title: "Joes" }, database)
    await updateListing(
      listing.id,
      {
        contactLinks: {
          address: "12 Main St",
          menuLinks: [
            { id: "m1", type: "custom", label: "Click", value: "javascript:alert(1)" },
          ],
          socialLinks: [],
        },
      },
      database
    )
    const saved = await findListing(listing.id, database)
    const link = saved!.contactLinks.menuLinks[0]!

    // Storing is deliberately not where the safety lives, and it could not be:
    // "example.com" is not a valid address either and is a perfectly ordinary
    // thing to type. The guarantee is one step later — nothing turns this into
    // something a browser will follow.
    expect(link.value).toBe("javascript:alert(1)")
    expect(menuLinkHref(link)).toBe("")
    expect(saved?.contactLinks.address).toBe("12 Main St")
  })

  it("keeps only allowed body nodes, so a pasted script is just text", async () => {
    const listing = await createListing({ title: "Joes" }, database)
    await updateListing(
      listing.id,
      {
        body: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "hello" }] },
            { type: "iframe", attrs: { src: "https://evil.example" } },
          ],
        },
      },
      database
    )
    const saved = await findListing(listing.id, database)
    expect(JSON.stringify(saved?.body)).not.toContain("iframe")
    expect(JSON.stringify(saved?.body)).toContain("hello")
  })
})

describe("the admin list", () => {
  it("searches, filters by status, and pages with an honest total", async () => {
    for (const title of ["Alpha Bakery", "Beta Bakery", "Gamma Garage"]) {
      await createListing({ title }, database)
    }
    const published = await createListing({ title: "Delta Bakery" }, database)
    await updateListing(published.id, { status: "published" }, database)

    const bakeries = await listListings({ search: "bakery" }, database)
    expect(bakeries.total).toBe(3)

    const publishedOnly = await listListings({ status: "published" }, database)
    expect(publishedOnly.total).toBe(1)
    expect(publishedOnly.listings[0].title).toBe("Delta Bakery")

    const pageTwo = await listListings(
      { sort: "title", direction: "asc", limit: 2, offset: 2 },
      database
    )
    expect(pageTwo.total).toBe(4)
    expect(pageTwo.listings).toHaveLength(2)
  })
})

describe("categories on a listing", () => {
  it("sets, replaces and marks one primary", async () => {
    const listing = await createListing({ title: "Joes" }, database)
    const food = await createCategory({ name: "Food" }, database)
    const bars = await createCategory({ name: "Bars" }, database)

    await setListingCategories(listing.id, [food.id, bars.id], bars.id, database)
    let links = await categoriesForListing(listing.id, database)
    expect(links).toHaveLength(2)
    expect(links.find((link) => link.isPrimary)?.categoryId).toBe(bars.id)

    // Replacing the set drops the old rows rather than piling new ones on.
    await setListingCategories(listing.id, [food.id], food.id, database)
    links = await categoriesForListing(listing.id, database)
    expect(links).toHaveLength(1)
    expect(links[0].categoryId).toBe(food.id)
  })

  it("refuses a primary that is not one of the chosen categories", async () => {
    const listing = await createListing({ title: "Joes" }, database)
    const food = await createCategory({ name: "Food" }, database)
    const bars = await createCategory({ name: "Bars" }, database)
    await expect(
      setListingCategories(listing.id, [food.id], bars.id, database)
    ).rejects.toThrow("primary category")
  })

  it("changes all of the categories or none of them", async () => {
    const listing = await createListing({ title: "Joes" }, database)
    const food = await createCategory({ name: "Food" }, database)
    const bars = await createCategory({ name: "Bars" }, database)
    await setListingCategories(listing.id, [food.id], food.id, database)

    // Swapping Food for Bars is a delete and then an insert. Break the insert
    // and the delete has already happened: without one transaction around the
    // pair, the listing is left in a state the form cannot produce — tagged
    // with nothing at all, having been asked to move to Bars.
    const brokenDb = breakInserts(database)

    await expect(
      setListingCategories(listing.id, [bars.id], bars.id, brokenDb)
    ).rejects.toThrow("the database went away")

    const links = await categoriesForListing(listing.id, database)
    expect(links.map((link) => link.categoryId)).toEqual([food.id])
    expect(links.find((link) => link.isPrimary)?.categoryId).toBe(food.id)
  })
})

describe("copying and deleting", () => {
  it("duplicates as a draft with a fresh address and the same categories", async () => {
    const listing = await createListing({ title: "Joes" }, database)
    const food = await createCategory({ name: "Food" }, database)
    await updateListing(listing.id, { status: "published" }, database)
    await setListingCategories(listing.id, [food.id], food.id, database)

    const copy = await duplicateListing(listing.id, database)
    expect(copy.title).toBe("Copy of Joes")
    expect(copy.status).toBe("draft")
    expect(copy.slug).not.toBe(listing.slug)
    const links = await categoriesForListing(copy.id, database)
    expect(links.map((link) => link.categoryId)).toEqual([food.id])
  })

  it("deletes a whole selection in one go and counts honestly", async () => {
    const a = await createListing({ title: "A" }, database)
    const b = await createListing({ title: "B" }, database)
    const food = await createCategory({ name: "Food" }, database)
    await setListingCategories(a.id, [food.id], null, database)

    const impact = await listingDeleteImpact([a.id, b.id, "gone"], database)
    expect(impact).toEqual({ listings: 2, categoryLinks: 1 })

    const result = await deleteListings([a.id, b.id, "gone"], database)
    expect(result.done.sort()).toEqual([a.id, b.id].sort())
    // A row somebody else already deleted is reported, not silently counted.
    expect(result.kept).toEqual(["gone"])

    expect(await findListing(a.id, database)).toBeNull()
    expect(await categoriesForListing(a.id, database)).toEqual([])
  })
})
