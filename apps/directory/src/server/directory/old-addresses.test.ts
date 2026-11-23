import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createListing,
  deleteListings,
  updateListing,
} from "@/server/directory/listings"
import { currentAddressFor } from "@/server/directory/old-addresses"
import { oldAddresses } from "@/server/directory/schema"
import { createEvent, deleteEvents, updateEvent } from "@/server/events/events"
import { createPost, deletePosts, updatePost } from "@/server/posts/posts"
import {
  createPromotion,
  deletePromotions,
  updatePromotion,
  type PromotionInput,
} from "@/server/promotions/promotions"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import * as schema from "@/server/schema"

/**
 * Old addresses keep working: a renamed listing, event, post or deal can still
 * be reached at the address it had before. A renamed guide's forward is
 * tested in `guides.test.ts`.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  await client.close()
})

/** A published listing at an address. */
async function listing(site: string, title: string, slug: string) {
  const made = await createListing(site, { title, slug }, database)
  return updateListing(site, made.id, { status: "published" }, database)
}

function rows() {
  return database
    .select({
      site: oldAddresses.workspaceId,
      kind: oldAddresses.kind,
      old: oldAddresses.oldSlug,
      current: oldAddresses.currentSlug,
    })
    .from(oldAddresses)
    .orderBy(oldAddresses.oldSlug)
}

const forward = (site: string, slug: string) =>
  currentAddressFor(site, "listing", slug, database)

describe("a renamed listing", () => {
  it("forwards its old address to its new one", async () => {
    const joes = await listing(alpha, "Joe's Diner", "joes-diner")
    await updateListing(alpha, joes.id, { slug: "joes-kitchen" }, database)

    expect(await forward(alpha, "joes-diner")).toBe("joes-kitchen")
    expect(await forward(alpha, "nobody-ever")).toBeNull()
  })

  it("lets two sites each have an old joes-diner", async () => {
    const mine = await listing(alpha, "Joe's Diner", "joes-diner")
    const theirs = await listing(beta, "Joe's Diner", "joes-diner")
    await updateListing(alpha, mine.id, { slug: "joes-kitchen" }, database)
    await updateListing(beta, theirs.id, { slug: "joes-pub" }, database)

    expect(await forward(alpha, "joes-diner")).toBe("joes-kitchen")
    expect(await forward(beta, "joes-diner")).toBe("joes-pub")
  })

  it("keeps every old address one hop from the page after two renames", async () => {
    const joes = await listing(alpha, "Joe's Diner", "joes-diner")
    await updateListing(alpha, joes.id, { slug: "joes-kitchen" }, database)
    await updateListing(alpha, joes.id, { slug: "joes-pub" }, database)

    expect(await rows()).toEqual([
      { site: alpha, kind: "listing", old: "joes-diner", current: "joes-pub" },
      {
        site: alpha,
        kind: "listing",
        old: "joes-kitchen",
        current: "joes-pub",
      },
    ])
  })

  it("never loops when a listing is renamed back", async () => {
    const joes = await listing(alpha, "Joe's Diner", "joes-diner")
    await updateListing(alpha, joes.id, { slug: "joes-kitchen" }, database)
    await updateListing(alpha, joes.id, { slug: "joes-diner" }, database)

    expect(await rows()).toEqual([
      {
        site: alpha,
        kind: "listing",
        old: "joes-kitchen",
        current: "joes-diner",
      },
    ])
    expect(await forward(alpha, "joes-diner")).toBeNull()
  })

  it("writes nothing when the save leaves the address alone", async () => {
    const joes = await listing(alpha, "Joe's Diner", "joes-diner")
    await updateListing(alpha, joes.id, { title: "Joe's" }, database)
    await updateListing(alpha, joes.id, { slug: "joes-diner" }, database)

    expect(await rows()).toEqual([])
  })

  it("adds no statement to a save that does not change the address", async () => {
    const joes = await listing(alpha, "Joe's Diner", "joes-diner")
    const statementsOf = async (input: { title?: string; slug?: string }) => {
      const statements: string[] = []
      const measured = drizzle(client, {
        schema,
        logger: { logQuery: (query) => statements.push(query) },
      }) as unknown as TestDatabase
      await updateListing(alpha, joes.id, input, measured)
      return statements
    }
    // What the extra work looks like: the address read before the save, and
    // the forward written after it.
    const readsAddress = (statement: string) =>
      statement.startsWith('select "slug" from "directory_listings"')
    const writesForward = (statement: string) =>
      statement.includes("old_addresses")

    // A rename does both, which is what proves the two checks can see it.
    const renamed = await statementsOf({ slug: "joes-kitchen" })
    expect(renamed.some(readsAddress)).toBe(true)
    expect(renamed.some(writesForward)).toBe(true)

    const titled = await statementsOf({ title: "Joe's" })
    expect(titled.some(readsAddress)).toBe(false)
    expect(titled.some(writesForward)).toBe(false)
  })
})

describe("reuse wins", () => {
  it("ends the forward when a new listing takes the old address", async () => {
    const joes = await listing(alpha, "Joe's Diner", "joes-diner")
    await updateListing(alpha, joes.id, { slug: "joes-kitchen" }, database)

    await createListing(
      alpha,
      { title: "A new Joe's Diner", slug: "joes-diner" },
      database
    )

    expect(await rows()).toEqual([])
    expect(await forward(alpha, "joes-diner")).toBeNull()
  })
})

describe("what an old address may lead to", () => {
  it("stops forwarding when the listing is deleted", async () => {
    const joes = await listing(alpha, "Joe's Diner", "joes-diner")
    await updateListing(alpha, joes.id, { slug: "joes-kitchen" }, database)
    await deleteListings(alpha, [joes.id], database)

    expect(await rows()).toEqual([])
    expect(await forward(alpha, "joes-diner")).toBeNull()
  })

  it("does not forward to a draft, and does to a closed listing", async () => {
    const joes = await listing(alpha, "Joe's Diner", "joes-diner")
    await updateListing(
      alpha,
      joes.id,
      { slug: "joes-kitchen", status: "draft" },
      database
    )
    expect(await forward(alpha, "joes-diner")).toBeNull()

    await updateListing(alpha, joes.id, { status: "closed" }, database)
    expect(await forward(alpha, "joes-diner")).toBe("joes-kitchen")
  })
})

describe("events, posts and deals", () => {
  it("forwards a renamed event, and forgets it when it is deleted", async () => {
    const made = await createEvent(
      alpha,
      {
        title: "Night market",
        when: { startDate: "2099-09-26", startTime: "18:00" },
      },
      database
    )
    await updateEvent(
      alpha,
      made.id,
      { slug: "summer-night-market", status: "published" },
      database
    )
    expect(
      await currentAddressFor(alpha, "event", "night-market", database)
    ).toBe("summer-night-market")
    // A listing once at the same address is a different question.
    expect(await forward(alpha, "night-market")).toBeNull()

    await deleteEvents(alpha, [made.id], database)
    expect(
      await currentAddressFor(alpha, "event", "night-market", database)
    ).toBeNull()
  })

  it("forwards a renamed post, and forgets it when it is deleted", async () => {
    const made = await createPost(alpha, { title: "Best brunch" }, database)
    await updatePost(
      alpha,
      made.id,
      { slug: "best-brunch-2026", status: "published" },
      database
    )
    expect(await currentAddressFor(alpha, "post", "best-brunch", database)).toBe(
      "best-brunch-2026"
    )

    await deletePosts(alpha, [made.id], database)
    expect(
      await currentAddressFor(alpha, "post", "best-brunch", database)
    ).toBeNull()
  })

  it("forwards a renamed deal, and forgets it with its listing", async () => {
    const owner = await insertUser(database)
    const place = await listing(alpha, "43 Down", "43-down")
    const input: PromotionInput = {
      title: "Pasta Tuesdays",
      listingId: place.id,
      description: "",
      coverImage: "",
      startDate: "2099-10-01",
      endDate: "2099-10-31",
      code: "",
      smallPrint: "",
      dealType: "two_for_one",
      amount: "",
      headline: "2 for 1",
      status: "published",
    }
    const made = await createPromotion(alpha, owner.id, input, database)
    await updatePromotion(
      alpha,
      made.id,
      { ...input, slug: "pasta-tuesdays-2099" },
      database
    )
    expect(
      await currentAddressFor(alpha, "promotion", "pasta-tuesdays", database)
    ).toBe("pasta-tuesdays-2099")

    // Deleting the listing deletes the deal, and its old address with it.
    await deleteListings(alpha, [place.id], database)
    expect(await rows()).toEqual([])

    const again = await listing(alpha, "43 Down", "43-down-again")
    const second = await createPromotion(
      alpha,
      owner.id,
      { ...input, listingId: again.id },
      database
    )
    await updatePromotion(
      alpha,
      second.id,
      { ...input, listingId: again.id, slug: "pasta-again" },
      database
    )
    await deletePromotions(alpha, [second.id], database)
    expect(await rows()).toEqual([])
  })
})
