import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { LISTINGS_NEEDS_NODE, LISTINGS_PAGE_ERRORS, LISTINGS_SECTIONS_NODE } from "@/lib/directory/listings-dashboard-page"
import { uuid } from "@/server/auth/security"
import { createListing, updateListing } from "@/server/directory/listings"
import {
  getListingsPage,
  getListingsWidgets,
  listingRecordFacts,
  listingsSectionCounts,
  needsYou,
  saveListingsPageBody,
  saveListingsSections,
  saveListingsWidgets,
  setListingsPageLock,
} from "@/server/directory/listings-dashboard"
import { directoryListingReports, directorySubmissions } from "@/server/directory/schema"
import { promotionRequests } from "@/server/promotions/schema"
import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"

/**
 * The Listings dashboard's own records: one left page per site that always
 * keeps its Dashboards block and refuses a save while locked, the Dashboards
 * block's rows, Overview's layout, every row's count, and what waits on an
 * admin, oldest first.
 */

let client: PGlite
let database: TestDatabase
let site: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

const DAY = 24 * 60 * 60 * 1000

async function waitingSubmission(name: string, daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * DAY)
  await database.insert(directorySubmissions).values({
    id: uuid(),
    workspaceId: site,
    businessName: name,
    contactEmail: "someone@example.test",
    categoryIds: [],
    status: "pending_review",
    createdAt: at,
    updatedAt: at,
  })
}

describe("the left page", () => {
  it("starts with its blocks, keeps the Dashboards block on every save, and refuses a save while locked", async () => {
    const first = await getListingsPage(site, database)
    expect(first.page.body).toContain(LISTINGS_SECTIONS_NODE)
    expect(first.page.body).toContain(LISTINGS_NEEDS_NODE)

    // A page saved without the Dashboards block gets it back.
    await saveListingsPageBody(site, JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), database)
    const saved = await getListingsPage(site, database)
    expect(saved.page.body).toContain(LISTINGS_SECTIONS_NODE)
    expect(saved.page.body).not.toContain(LISTINGS_NEEDS_NODE)

    await setListingsPageLock(site, true, database)
    await expect(saveListingsPageBody(site, saved.page.body, database)).rejects.toThrow(LISTINGS_PAGE_ERRORS.locked)
  })

  it("keeps only real rows in the Dashboards block's hidden and order lists", async () => {
    await saveListingsSections(
      site,
      // Overview and a made-up row are not rows the block can hide or move.
      { hidden: ["claims", "overview" as never, "nonsense" as never], order: ["reports", "reports", "listings"] },
      database
    )
    const { sections } = await getListingsPage(site, database)
    expect(sections).toEqual({ hidden: ["claims"], order: ["reports", "listings"] })
  })

  it("starts Overview with five widgets and drops a widget it does not know", async () => {
    const start = await getListingsWidgets(site, database)
    expect([...start.top.spots, ...start.bottom.spots]).toHaveLength(5)
    const saved = await saveListingsWidgets(
      site,
      { top: { columns: 1, spots: ["made-up-widget"] }, bottom: { columns: 1, spots: ["most-saved"] } },
      database
    )
    expect(saved.top.spots).toEqual([null])
    expect(saved.bottom.spots).toEqual(["most-saved"])
  })
})

describe("the counts and Needs you", () => {
  it("counts every listing but only the waiting queue records", async () => {
    const live = await createListing(site, { title: "Open Place" }, database)
    await updateListing(site, live.id, { status: "published" }, database)
    await createListing(site, { title: "Draft Place" }, database)
    await waitingSubmission("Waiting Cafe", 1)
    const at = new Date()
    await database.insert(directorySubmissions).values({
      id: uuid(),
      workspaceId: site,
      businessName: "Already Rejected",
      contactEmail: "someone@example.test",
      categoryIds: [],
      status: "rejected",
      createdAt: at,
      updatedAt: at,
    })

    const counts = await listingsSectionCounts(site, database)
    expect(counts.listings).toBe(2)
    expect(counts.submissions).toBe(1)
    expect(counts.claims).toBe(0)
  })

  it("lists the oldest waiting records first, every kind together", async () => {
    await waitingSubmission("Newer Cafe", 1)
    await waitingSubmission("Older Cafe", 9)
    const listing = await createListing(site, { title: "Reported Diner" }, database)
    const reportedAt = new Date(Date.now() - 4 * DAY)
    await database.insert(directoryListingReports).values({
      id: uuid(),
      workspaceId: site,
      listingId: listing.id,
      reason: "wrong_hours",
      status: "open",
      createdAt: reportedAt,
      updatedAt: reportedAt,
    })

    const needs = await needsYou(site, database)
    expect(needs.rows.map((row) => [row.section, row.name])).toEqual([
      ["submissions", "Older Cafe"],
      ["reports", "Reported Diner"],
      ["submissions", "Newer Cafe"],
    ])
    expect(needs.total).toBe(3)
  })
})

describe("the deal rows", () => {
  it("counts every deal, only the owners' requests waiting, and puts those in Needs you", async () => {
    const listing = await createListing(site, { title: "Café Luna" }, database)
    const request = (status: string, daysAgo: number) => {
      const at = new Date(Date.now() - daysAgo * DAY)
      return database.insert(promotionRequests).values({
        id: uuid(),
        workspaceId: site,
        listingId: listing.id,
        kind: "new",
        status,
        title: `Deal ${status}`,
        startDate: "2026-11-01",
        dealType: "other",
        headline: "Free cookie",
        createdAt: at,
        updatedAt: at,
      })
    }
    await request("pending", 5)
    await request("rejected", 6)

    const counts = await listingsSectionCounts(site, database)
    expect(counts.dealRequests).toBe(1)
    expect(counts.promotions).toBe(0)
    const needs = await needsYou(site, database)
    expect(needs.rows.map((row) => [row.section, row.name])).toEqual([["dealRequests", "Deal pending"]])
    expect(needs.total).toBe(1)
  })
})

describe("the listing's record", () => {
  it("shows a listing's open reports to its own site and nothing to another", async () => {
    const listing = await createListing(site, { title: "Reported Diner" }, database)
    const at = new Date()
    await database.insert(directoryListingReports).values({
      id: uuid(),
      workspaceId: site,
      listingId: listing.id,
      reason: "wrong_hours",
      status: "open",
      createdAt: at,
      updatedAt: at,
    })

    const own = await listingRecordFacts(site, listing.id, database)
    expect(own.reports).toHaveLength(1)

    // Another site asking about this listing's id reads none of it.
    const other = (await insertWorkspace(database)).id
    const theirs = await listingRecordFacts(other, listing.id, database)
    expect(theirs.reports).toEqual([])
    expect(theirs.saves).toBe(0)
    expect(theirs.owner).toBeNull()
  })
})
