import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createListing, updateListing } from "@/server/directory/listings"
import {
  countReportAttempt,
  createReport,
  listReports,
} from "@/server/directory/reports"
import { directoryListingReports } from "@/server/directory/schema"
import { createPromotion, deletePromotions } from "@/server/promotions/promotions"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Reports on deals: the same table, queue and limits as listings and events,
 * with a deal's own reasons.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let listingId: string
let dealId: string
let userId: string

async function deal(title: string, status: "draft" | "published" = "published", onListing = listingId) {
  return (
    await createPromotion(
      alpha,
      userId,
      {
        title,
        listingId: onListing,
        description: "",
        coverImage: "",
        code: "",
        smallPrint: "",
        dealType: "free_item",
        amount: "",
        headline: "Free cookie",
        status,
        startDate: "2026-09-01",
        endDate: "2026-09-02",
      },
      database
    )
  ).id
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  userId = (await insertUser(database)).id
  const listing = await createListing(alpha, { title: "Café Luna" }, database)
  listingId = listing.id
  await updateListing(alpha, listingId, { status: "published" }, database)
  // Ended already: "it has ended" is one of the reasons, so ended deals count.
  dealId = await deal("Free cookie with coffee")
})

afterEach(async () => {
  await client.close()
})

describe("reports about deals", () => {
  it("files one against a published deal, ended or not, without an account", async () => {
    const { report, subjectTitle } = await createReport(
      alpha,
      { kind: "promotion", subjectId: dealId, reason: "not_honoured" },
      database
    )
    expect(report).toMatchObject({ kind: "promotion", subjectId: dealId, status: "open" })
    expect(subjectTitle).toBe("Free cookie with coffee")
  })

  it("keeps a deal to its own reasons", async () => {
    await expect(
      createReport(alpha, { kind: "promotion", subjectId: dealId, reason: "wrong_hours" }, database)
    ).rejects.toThrow("Pick what is wrong with this deal.")
    await expect(
      database.insert(directoryListingReports).values({
        id: "x",
        workspaceId: alpha,
        promotionId: dealId,
        reason: "cancelled",
        status: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).rejects.toThrow()
  })

  it("does not find a draft deal, or a deal at a draft listing", async () => {
    const draft = await deal("Draft", "draft")
    const hidden = await createListing(alpha, { title: "Not open yet" }, database)
    const atHidden = await deal("At a draft listing", "published", hidden.id)
    for (const subjectId of [draft, atHidden]) {
      await expect(
        createReport(alpha, { kind: "promotion", subjectId, reason: "ended" }, database)
      ).rejects.toThrow("That deal is no longer on this site.")
    }
  })

  it("shares the queue, narrowed with the Deal kind, and names the deal", async () => {
    await createReport(alpha, { kind: "promotion", subjectId: dealId, reason: "ended" }, database)
    await createReport(alpha, { kind: "listing", subjectId: listingId, reason: "closed" }, database)
    const deals = await listReports(alpha, { kind: "promotion" }, database)
    expect(deals.reports.map((row) => row.kind)).toEqual(["promotion"])
    expect(deals.reports[0]).toMatchObject({
      subjectTitle: "Free cookie with coffee",
      subjectSlug: "free-cookie-with-coffee",
    })
    expect((await listReports(alpha, {}, database)).total).toBe(2)
    expect((await listReports(alpha, { search: "cookie" }, database)).total).toBe(1)
  })

  it("goes with its deal", async () => {
    await createReport(alpha, { kind: "promotion", subjectId: dealId, reason: "ended" }, database)
    await deletePromotions(alpha, [dealId], database)
    const left = await database
      .select()
      .from(directoryListingReports)
      .where(eq(directoryListingReports.workspaceId, alpha))
    expect(left).toEqual([])
  })
})

describe("the limits, shared with listings and events", () => {
  const about = (kind: "listing" | "event" | "promotion", id: string) => ({ kind, subjectId: id })

  it("takes one report per deal an hour from a visitor", async () => {
    await countReportAttempt(alpha, "1.1.1.1", about("promotion", dealId), database)
    await expect(
      countReportAttempt(alpha, "1.1.1.1", about("promotion", dealId), database)
    ).rejects.toThrow("already sent a report about this deal")
  })

  it("stops an 11th report from one visitor across every kind", async () => {
    for (let index = 0; index < 4; index += 1) {
      await countReportAttempt(alpha, "1.1.1.1", about("listing", `l${index}`), database)
      await countReportAttempt(alpha, "1.1.1.1", about("event", `e${index}`), database)
    }
    await countReportAttempt(alpha, "1.1.1.1", about("promotion", "p1"), database)
    await countReportAttempt(alpha, "1.1.1.1", about("promotion", "p2"), database)
    await expect(
      countReportAttempt(alpha, "1.1.1.1", about("promotion", "p-eleventh"), database)
    ).rejects.toThrow("a lot of reports in a short time")
  })
})
