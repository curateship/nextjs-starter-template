import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createListing, updateListing } from "@/server/directory/listings"
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

  const make = async (
    title: string,
    listingId: string,
    status: PromotionInput["status"]
  ) =>
    (
      await createPromotion(
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
          headline: "Happy hour",
          status,
          startDate: today,
          endDate: null,
        },
        database
      )
    ).slug

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
  dealsAccessFor: { notADealRead: "Reads the Deals page's switch." },
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

describe("the promotions table", () => {
  /**
   * Only these files may read the table. A read written anywhere else would
   * skip the one filter in `public.ts`, so it has to live there instead.
   */
  const allowed = [
    "server/promotions/promotions.ts", // Admin → Promotions, which shows everything.
    "server/promotions/public.ts", // Every public read, through the one filter.
    "server/promotions/schema.ts",
  ]

  it("is read only by the admin and the public reads", () => {
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
