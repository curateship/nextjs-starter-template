import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { menuLinkHref } from "@/lib/directory/contact-links"
import { uuid } from "@/server/auth/security"
import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"
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
import { recordVisit } from "@/server/traffic"

/**
 * Listings are plain records with two promises: an address only ever belongs
 * to one listing, and nothing unsafe survives a save — a poisoned link or a
 * pasted script goes in and comes back out as nothing.
 */

let client: PGlite
let database: TestDatabase
/** The site every listing and category in these tests belongs to. */
let site: string

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
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

describe("creating and addressing", () => {
  it("derives the address from the title and starts as a draft", async () => {
    const listing = await createListing(site, { title: "Joe's Diner & Grill" }, database)
    expect(listing.slug).toBe("joes-diner-grill")
    expect(listing.status).toBe("draft")
  })

  it("numbers a name clash instead of failing the create", async () => {
    await createListing(site, { title: "Joes Diner" }, database)
    const second = await createListing(site, { title: "Joes Diner" }, database)
    expect(second.slug).toBe("joes-diner-2")
  })

  it("refuses a hand-picked address another listing already uses", async () => {
    await createListing(site, { title: "First", slug: "the-spot" }, database)
    await expect(
      createListing(site, { title: "Second", slug: "the-spot" }, database)
    ).rejects.toThrow("already uses the address the-spot")
    await expect(
      updateListing(site,
        (await createListing(site, { title: "Third" }, database)).id,
        { slug: "the-spot" },
        database
      )
    ).rejects.toThrow("already uses the address the-spot")
  })

  it("refuses an address that is not one", async () => {
    await expect(
      createListing(site, { title: "X", slug: "Not A Slug!" }, database)
    ).rejects.toThrow("lowercase letters")
  })
})

describe("what a save may contain", () => {
  it("starts without a rating and stores Directory's decimal values", async () => {
    const listing = await createListing(site, { title: "Joes" }, database)
    expect(listing.rating).toBeNull()

    expect(
      (await updateListing(site, listing.id, { rating: 4.6 }, database)).rating
    ).toBe(4.6)
    expect(
      (await updateListing(site, listing.id, { rating: 0 }, database)).rating
    ).toBe(0)
    expect(
      (await updateListing(site, listing.id, { rating: null }, database)).rating
    ).toBeNull()
  })

  it("refuses ratings outside one decimal place from 0 to 5", async () => {
    const listing = await createListing(site, { title: "Joes" }, database)

    for (const rating of [-0.1, 4.25, 5.1, Number.NaN]) {
      await expect(
        updateListing(site, listing.id, { rating }, database)
      ).rejects.toThrow(
        "Rating must be a number from 0 to 5 with no more than one decimal place."
      )
    }
  })

  it("stores a poisoned link as typed but never makes it followable", async () => {
    const listing = await createListing(site, { title: "Joes" }, database)
    await updateListing(site,
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
    const saved = await findListing(site, listing.id, database)
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
    const listing = await createListing(site, { title: "Joes" }, database)
    await updateListing(site,
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
    const saved = await findListing(site, listing.id, database)
    expect(JSON.stringify(saved?.body)).not.toContain("iframe")
    expect(JSON.stringify(saved?.body)).toContain("hello")
  })
})

describe("the admin list", () => {
  it("searches, filters by status, and pages with an honest total", async () => {
    for (const title of ["Alpha Bakery", "Beta Bakery", "Gamma Garage"]) {
      await createListing(site, { title }, database)
    }
    const published = await createListing(site, { title: "Delta Bakery" }, database)
    await updateListing(site, published.id, { status: "published" }, database)

    const bakeries = await listListings(site, { search: "bakery" }, database)
    expect(bakeries.total).toBe(3)

    const publishedOnly = await listListings(site, { status: "published" }, database)
    expect(publishedOnly.total).toBe(1)
    expect(publishedOnly.listings[0].title).toBe("Delta Bakery")

    const pageTwo = await listListings(site, { sort: "title", direction: "asc", limit: 2, offset: 2 },
      database
    )
    expect(pageTwo.total).toBe(4)
    expect(pageTwo.listings).toHaveLength(2)
  })

  it("sorts the full result by views and shows zero for an unviewed listing", async () => {
    const quiet = await createListing(site, { title: "Quiet" }, database)
    const popular = await createListing(site, { title: "Popular" }, database)
    await recordVisit(
      {
        workspaceId: site,
        path: `/directory/${popular.slug}`,
        referrerDomain: "direct",
        device: "computer",
        audience: "visitor",
        visitorHash: uuid(),
      },
      database
    )

    const result = await listListings(
      site,
      { sort: "views", direction: "desc", viewDays: 30 },
      database
    )

    expect(result.listings.map((listing) => listing.id)).toEqual([
      popular.id,
      quiet.id,
    ])
    expect(result.listings.map((listing) => listing.views)).toEqual([1, 0])
  })
})

describe("categories on a listing", () => {
  it("sets, replaces and marks one primary", async () => {
    const listing = await createListing(site, { title: "Joes" }, database)
    const food = await createCategory(site, { name: "Food" }, database)
    const bars = await createCategory(site, { name: "Bars" }, database)

    await setListingCategories(site, listing.id, [food.id, bars.id], bars.id, database)
    let links = await categoriesForListing(site, listing.id, database)
    expect(links).toHaveLength(2)
    expect(links.find((link) => link.isPrimary)?.categoryId).toBe(bars.id)

    // Replacing the set drops the old rows rather than piling new ones on.
    await setListingCategories(site, listing.id, [food.id], food.id, database)
    links = await categoriesForListing(site, listing.id, database)
    expect(links).toHaveLength(1)
    expect(links[0].categoryId).toBe(food.id)
  })

  it("refuses a primary that is not one of the chosen categories", async () => {
    const listing = await createListing(site, { title: "Joes" }, database)
    const food = await createCategory(site, { name: "Food" }, database)
    const bars = await createCategory(site, { name: "Bars" }, database)
    await expect(
      setListingCategories(site, listing.id, [food.id], bars.id, database)
    ).rejects.toThrow("primary category")
  })

  it("changes all of the categories or none of them", async () => {
    const listing = await createListing(site, { title: "Joes" }, database)
    const food = await createCategory(site, { name: "Food" }, database)
    const bars = await createCategory(site, { name: "Bars" }, database)
    await setListingCategories(site, listing.id, [food.id], food.id, database)

    // Swapping Food for Bars is a delete and then an insert. Break the insert
    // and the delete has already happened: without one transaction around the
    // pair, the listing is left in a state the form cannot produce — tagged
    // with nothing at all, having been asked to move to Bars.
    const brokenDb = breakInserts(database)

    await expect(
      setListingCategories(site, listing.id, [bars.id], bars.id, brokenDb)
    ).rejects.toThrow("the database went away")

    const links = await categoriesForListing(site, listing.id, database)
    expect(links.map((link) => link.categoryId)).toEqual([food.id])
    expect(links.find((link) => link.isPrimary)?.categoryId).toBe(food.id)
  })
})

describe("copying and deleting", () => {
  it("duplicates as a draft with a fresh address and the same categories", async () => {
    const listing = await createListing(site, { title: "Joes" }, database)
    const food = await createCategory(site, { name: "Food" }, database)
    await updateListing(site, listing.id, { status: "published" }, database)
    await setListingCategories(site, listing.id, [food.id], food.id, database)

    const copy = await duplicateListing(site, listing.id, database)
    expect(copy.title).toBe("Copy of Joes")
    expect(copy.status).toBe("draft")
    expect(copy.slug).not.toBe(listing.slug)
    const links = await categoriesForListing(site, copy.id, database)
    expect(links.map((link) => link.categoryId)).toEqual([food.id])
  })

  it("deletes a whole selection in one go and counts honestly", async () => {
    const a = await createListing(site, { title: "A" }, database)
    const b = await createListing(site, { title: "B" }, database)
    const food = await createCategory(site, { name: "Food" }, database)
    await setListingCategories(site, a.id, [food.id], null, database)

    const impact = await listingDeleteImpact(site, [a.id, b.id, "gone"], database)
    expect(impact).toEqual({ listings: 2, categoryLinks: 1 })

    const result = await deleteListings(site, [a.id, b.id, "gone"], database)
    expect(result.done.sort()).toEqual([a.id, b.id].sort())
    // A row somebody else already deleted is reported, not silently counted.
    expect(result.kept).toEqual(["gone"])

    expect(await findListing(site, a.id, database)).toBeNull()
    expect(await categoriesForListing(site, a.id, database)).toEqual([])
  })
})
