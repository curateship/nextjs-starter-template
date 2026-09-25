import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createListing, updateListing } from "@/server/directory/listings"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { dealViewAt } from "@/server/promotions/deal-view"
import {
  createPromotion,
  type PromotionInput,
} from "@/server/promotions/promotions"
import {
  dealsAccessFor,
  readDeals,
  readPublicDeal,
} from "@/server/promotions/public"
import { customShellWorkspaces } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * What a visitor can reach: published deals at published listings on the
 * site they are visiting, on now first, then starting soon, and gone the
 * morning after their last day by the site's calendar.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let userId: string
let listingId: string

const today = "2026-10-05"

async function deal(
  title: string,
  days: { startDate: string; endDate: string | null },
  overrides: Partial<PromotionInput> = {}
) {
  return createPromotion(
    site.id,
    userId,
    {
      title,
      listingId,
      description: "",
      coverImage: "",
      code: "",
      smallPrint: "",
      dealType: "percent_off",
      amount: "20",
      headline: "",
      status: "published",
      ...days,
      ...overrides,
    },
    database
  )
}

async function setPage(path: string, visibility: string) {
  await database
    .update(customShellWorkspaces)
    .set({ settings: { pages: { [path]: { visibility } } } })
    .where(eq(customShellWorkspaces.id, site.id))
  resetPublicDirectoryCacheForTests()
}

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  userId = (await insertUser(database)).id
  const listing = await createListing(site.id, { title: "43 Down" }, database)
  await updateListing(site.id, listing.id, { status: "published" }, database)
  listingId = listing.id
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

describe("the Deals page", () => {
  it("lists deals on now, ending soonest first, then deals starting soon", async () => {
    await deal("No end", { startDate: "2026-09-01", endDate: null })
    await deal("Ends Friday", { startDate: "2026-10-01", endDate: "2026-10-09" })
    await deal("Ends today", { startDate: "2026-10-05", endDate: today })
    await deal("Next month", { startDate: "2026-11-01", endDate: null })
    await deal("Next week", { startDate: "2026-10-12", endDate: "2026-10-18" })
    await deal("Ended yesterday", {
      startDate: "2026-09-01",
      endDate: "2026-10-04",
    })

    const list = await readDeals(site, 1, today, database)
    expect(list.deals.map((row) => row.title)).toEqual([
      "Ends today",
      "Ends Friday",
      "No end",
      "Next week",
      "Next month",
    ])
    expect(list.total).toBe(5)
    expect(list.deals[0]?.listingTitle).toBe("43 Down")
    expect(list.deals[0]?.headline).toBe("20% off")
  })

  it("drops a deal the morning after its last day with nothing else changing", async () => {
    await deal("Pasta week", { startDate: "2026-10-01", endDate: today })
    expect((await readDeals(site, 1, today, database)).total).toBe(1)
    // The next day is a new cache entry, so no job and no cache clear is needed.
    expect((await readDeals(site, 1, "2026-10-06", database)).total).toBe(0)
  })

  it("leaves out drafts and deals at a draft listing", async () => {
    await deal("Draft deal", { startDate: today, endDate: null }, { status: "draft" })
    const hidden = await createListing(site.id, { title: "Not open yet" }, database)
    await deal(
      "At a draft listing",
      { startDate: today, endDate: null },
      { listingId: hidden.id }
    )
    expect((await readDeals(site, 1, today, database)).total).toBe(0)

    await updateListing(site.id, hidden.id, { status: "published" }, database)
    resetPublicDirectoryCacheForTests()
    expect(
      (await readDeals(site, 1, today, database)).deals.map((row) => row.title)
    ).toEqual(["At a draft listing"])
  })

  it("never shows another site's deals", async () => {
    const beta = await insertWorkspace(database, { name: "Beta" })
    const theirListing = await createListing(beta.id, { title: "Beta Bar" }, database)
    await updateListing(beta.id, theirListing.id, { status: "published" }, database)
    await createPromotion(
      beta.id,
      userId,
      {
        title: "Beta deal",
        listingId: theirListing.id,
        description: "",
        coverImage: "",
        code: "",
        smallPrint: "",
        dealType: "free_item",
        amount: "",
        headline: "Free dessert",
        status: "published",
        startDate: today,
        endDate: null,
      },
      database
    )
    expect((await readDeals(site, 1, today, database)).total).toBe(0)
  })
})

describe("a deal's page", () => {
  it("still opens once the deal has ended, says so and hides the code", async () => {
    const made = await deal(
      "Pasta week",
      { startDate: "2026-10-01", endDate: today },
      { code: "PASTA2" }
    )
    const page = await readPublicDeal(site, made.slug, database)
    expect(page).not.toBeNull()

    // 11pm on its last day in Toronto: still on, code shown.
    const lastEvening = dealViewAt(page!, new Date("2026-10-06T03:00:00Z"))
    expect(lastEvening.ended).toBe(false)
    expect(lastEvening.deal.code).toBe("PASTA2")

    // 1am the next day in Toronto: over, and the code is gone.
    const nextMorning = dealViewAt(page!, new Date("2026-10-06T05:00:00Z"))
    expect(nextMorning.ended).toBe(true)
    expect(nextMorning.deal.code).toBe("")
  })

  it("says a deal with no end has no end date", async () => {
    const made = await deal("Happy hour", { startDate: "2026-10-01", endDate: null })
    const page = await readPublicDeal(site, made.slug, database)
    expect(dealViewAt(page!, new Date("2030-01-01T12:00:00Z"))).toMatchObject({
      ended: false,
      days: "From Oct 1, 2026. No end date",
    })
  })

  it("is missing for a draft, and for a deal at a draft listing", async () => {
    const draft = await deal(
      "Draft deal",
      { startDate: today, endDate: null },
      { status: "draft" }
    )
    const hidden = await createListing(site.id, { title: "Not open yet" }, database)
    const atDraft = await deal(
      "At a draft listing",
      { startDate: today, endDate: null },
      { listingId: hidden.id }
    )
    expect(await readPublicDeal(site, draft.slug, database)).toBeNull()
    expect(await readPublicDeal(site, atDraft.slug, database)).toBeNull()
  })

  it("links the listing only while the directory is open to everyone", async () => {
    const made = await deal("Pasta week", { startDate: today, endDate: null })
    expect(
      (await readPublicDeal(site, made.slug, database))?.deal.listingSlug
    ).toBe("43-down")

    await setPage("/directory", "members")
    expect(
      (await readPublicDeal(site, made.slug, database))?.deal.listingSlug
    ).toBeNull()
  })
})

describe("the on/off switch", () => {
  const signedIn = async () => true
  const signedOut = async () => false

  it("follows the Deals page's visibility", async () => {
    expect(await dealsAccessFor(site.id, signedOut, database)).toBe("everyone")

    await setPage("/deals", "members")
    expect(await dealsAccessFor(site.id, signedOut, database)).toBeNull()
    expect(await dealsAccessFor(site.id, signedIn, database)).toBe("members")

    await setPage("/deals", "off")
    expect(await dealsAccessFor(site.id, signedIn, database)).toBeNull()
  })
})
