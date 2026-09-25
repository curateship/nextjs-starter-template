import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { slugFromTitle } from "@/lib/directory/slugs"
import { createCategory } from "@/server/directory/categories"
import { setContentCategories } from "@/server/directory/content-categories"
import { createListing, updateListing } from "@/server/directory/listings"
import { LISTING_CONTENT_TYPE } from "@/server/directory/schema"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  createPromotion,
  type PromotionInput,
} from "@/server/promotions/promotions"
import * as publicReads from "@/server/promotions/public"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * A draft deal, and a deal at a draft listing, never reach a visitor. The old
 * Directory app let each events list check for itself, and all but one
 * forgot, so these tests fail the moment a new public read of deals is added
 * without being proven to leave both out.
 */

let client: PGlite
let database: TestDatabase
let site: VisitorSite
let listed: string
let hidden: string[]
/** Both listings: the published one and the draft one. */
let listingIds: string[]
/** Every deal made, by id, so a read by id can be checked by address. */
let madeDeals: { id: string; slug: string }[]

const today = "2026-10-05"
// 3 PM that day, the site's wall clock.
const now = `${today}T15:00`

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  const alpha = await insertWorkspace(database, { name: "Alpha" })
  site = { id: alpha.id, name: alpha.name, url: "https://alpha.example.com" }
  const userId = (await insertUser(database)).id

  const open = await createListing(site.id, { title: "43 Down" }, database)
  await updateListing(site.id, open.id, { status: "published" }, database)
  const closed = await createListing(site.id, { title: "Not open yet" }, database)

  madeDeals = []
  const make = async (
    title: string,
    listingId: string,
    status: PromotionInput["status"]
  ) => {
    const made = await createPromotion(
        site.id,
        userId,
        {
          title,
          listingId,
          description: "",
          coverImage: "",
          code: "",
          smallPrint: "",
          dealType: "other",
          amount: "",
          // Its own address, so a read that returns headlines can be checked
          // the same way as one that returns addresses.
          headline: slugFromTitle(title),
          status,
          startDate: today,
          endDate: null,
        },
        database
      )
    madeDeals.push({ id: made.id, slug: made.slug })
    return made.slug
  }

  listingIds = [open.id, closed.id]
  listed = await make("Open deal", open.id, "published")
  hidden = [
    await make("Draft deal", open.id, "draft"),
    await make("At a draft listing", closed.id, "published"),
  ]
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

type PublicRead = keyof typeof publicReads

/**
 * Every function `public.ts` exports. A read returns the addresses it would
 * show a visitor. Anything else says why it shows no deals. A new export that
 * is missing here fails the type check and the first test below.
 */
const everyPublicRead: Record<
  PublicRead,
  (() => Promise<string[]>) | { notADealRead: string }
> = {
  readDeals: async () =>
    (await publicReads.readDeals(site, 1, now, database)).deals.map(
      (deal) => deal.slug
    ),
  readPublicDeal: async () => {
    const found: string[] = []
    for (const slug of [listed, ...hidden]) {
      const page = await publicReads.readPublicDeal(site, slug, database)
      if (page) found.push(page.deal.slug)
    }
    return found
  },
  readListingDeals: async () =>
    (
      await Promise.all(
        listingIds.map((id) =>
          publicReads.readListingDeals(site, id, now, database)
        )
      )
    )
      .flat()
      .map((deal) => deal.slug),
  dealHeadlinesFor: async () => [
    ...(
      await publicReads.dealHeadlinesFor(site.id, listingIds, now, database)
    ).values(),
  ],
  readNewestDeals: async () =>
    (await publicReads.readNewestDeals(site, now, { limit: 12 }, database)).map(
      (deal) => deal.slug
    ),
  findReportableDeal: async () => {
    const found: string[] = []
    for (const deal of madeDeals) {
      if (await publicReads.findReportableDeal(site.id, deal.id, database)) {
        found.push(deal.slug)
      }
    }
    return found
  },
  dealsAccessFor: { notADealRead: "Reads the Deals page's switch." },
  readDealCategories: {
    notADealRead: "Lists categories, not deals. Proven on its own below.",
  },
}

describe("hidden deals", () => {
  it("names every function public.ts exports", () => {
    const exported = Object.entries(publicReads)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort()
    expect(Object.keys(everyPublicRead).sort()).toEqual(exported)
  })

  for (const [name, read] of Object.entries(everyPublicRead)) {
    if (typeof read !== "function") continue
    it(`are left out of ${name}`, async () => {
      const shown = await read()
      // The open deal proves the read found something to leave out from.
      expect(shown).toContain(listed)
      for (const slug of hidden) expect(shown).not.toContain(slug)
    })
  }
})

describe("the Deals page's category chips", () => {
  it("never offer a category whose only deals are hidden", async () => {
    const [open, closed] = listingIds as [string, string]
    const food = await createCategory(site.id, { name: "Food" }, database)
    const secret = await createCategory(site.id, { name: "Secret" }, database)
    await setContentCategories(site.id, LISTING_CONTENT_TYPE, open, [food.id], database)
    await setContentCategories(site.id, LISTING_CONTENT_TYPE, closed, [secret.id], database)
    expect(
      (await publicReads.readDealCategories(site.id, now, database)).map(
        (row) => row.slug
      )
    ).toEqual([food.slug])
  })
})

describe("the promotions table", () => {
  /**
   * Only these files may read the table. A read written anywhere else would
   * skip the one filter in `public.ts`, so it has to live there instead.
   */
  const allowed = [
    "server/directory/reports.ts", // Admin: the reports queue names each deal.
    "server/promotions/claims.ts", // One deal's claim box, under a lock, found by its id.
    "server/promotions/owner-requests.ts", // An owner's own deals, and the queue's live wording.
    "server/promotions/promotions.ts", // Admin → Promotions, which shows everything.
    "server/promotions/public.ts", // Every public read, through the one filter.
    "server/promotions/schema.ts",
  ]

  it("is read only by the admin, the owners' requests and the public reads", () => {
    const root = path.resolve(__dirname, "../..")
    const readers = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) =>
        /\bsitePromotions\b/.test(readFileSync(path.join(root, file), "utf8"))
      )
      .map((file) => file.split(path.sep).join("/"))
      .sort()
    expect(readers).toEqual(allowed)
  })
})
