import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createClaim,
  reviewClaim,
  verifyClaim,
} from "@/server/directory/claims"
import { createListing, updateListing } from "@/server/directory/listings"
import { uuid } from "@/server/auth/security"
import {
  listingViewCounts,
  readOwnerListingViews,
} from "@/server/directory/views"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import { loadTrafficSummary, recordVisit } from "@/server/traffic"
import { customShellTrafficDailyFacts } from "@/server/schema"

const AT = new Date("2026-08-13T12:00:00.000Z")

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

async function view(workspaceId: string, slug: string, at: Date = AT) {
  await recordVisit(
    {
      workspaceId,
      path: `/directory/${slug}`,
      referrerDomain: "direct",
      device: "computer",
      audience: "visitor",
      visitorHash: uuid(),
    },
    database,
    at
  )
}

describe("listing view counts", () => {
  it("keeps the same slug's views inside its own site", async () => {
    const alphaListing = await createListing(
      alpha,
      { title: "Alpha diner", slug: "joes-diner" },
      database
    )
    const betaListing = await createListing(
      beta,
      { title: "Beta diner", slug: "joes-diner" },
      database
    )

    await view(alpha, "joes-diner")
    await view(alpha, "joes-diner")
    await view(beta, "joes-diner")

    const alphaCounts = await listingViewCounts(
      alpha,
      [alphaListing.id],
      30,
      database,
      AT
    )
    const betaCounts = await listingViewCounts(
      beta,
      [betaListing.id],
      30,
      database,
      AT
    )

    expect(alphaCounts.get(alphaListing.id)).toBe(2)
    expect(betaCounts.get(betaListing.id)).toBe(1)
  })

  it("uses the same path totals as Traffic and respects the range", async () => {
    const current = await createListing(
      alpha,
      { title: "Current", slug: "current" },
      database
    )
    await createListing(alpha, { title: "Quiet", slug: "quiet" }, database)

    await view(alpha, "current")
    await view(alpha, "current", new Date("2026-08-03T12:00:00.000Z"))
    await view(alpha, "current", new Date("2025-08-12T12:00:00.000Z"))

    const week = await listingViewCounts(
      alpha,
      [current.id],
      7,
      database,
      AT
    )
    const month = await listingViewCounts(
      alpha,
      [current.id],
      30,
      database,
      AT
    )
    const year = await listingViewCounts(
      alpha,
      [current.id],
      365,
      database,
      AT
    )
    const all = await listingViewCounts(
      alpha,
      [current.id],
      "all",
      database,
      AT
    )
    const traffic = await loadTrafficSummary(alpha, 30, database, AT)

    expect(week.get(current.id)).toBe(1)
    expect(month.get(current.id)).toBe(2)
    expect(year.get(current.id)).toBe(2)
    expect(all.get(current.id)).toBe(3)
    expect(traffic.topPages).toContainEqual({
      key: "/directory/current",
      views: 2,
    })
  })
})

describe("the owner's daily listing views", () => {
  async function approvedListing() {
    const owner = await insertUser(database)
    const other = await insertUser(database)
    const admin = await insertUser(database, { role: "admin" })
    const listing = await createListing(
      alpha,
      { title: "Owner's diner", slug: "owners-diner" },
      database
    )
    await updateListing(alpha, listing.id, { status: "published" }, database)
    const made = await createClaim(
      alpha,
      listing.id,
      owner.id,
      { contactEmail: owner.email, claimantName: owner.name },
      database
    )
    await verifyClaim(made.token, database)
    await reviewClaim(
      alpha,
      made.claim.id,
      { decision: "approve", reviewerId: admin.id },
      database
    )
    return { listing, owner, other }
  }

  async function dailyFact(
    workspaceId: string,
    slug: string,
    day: string,
    views: number
  ) {
    await database.insert(customShellTrafficDailyFacts).values({
      workspaceId,
      day,
      dimension: "path",
      key: `/directory/${slug}`,
      views,
    })
  }

  it("refuses somebody who does not own the approved claim", async () => {
    const { listing, other } = await approvedListing()

    await expect(
      readOwnerListingViews(other.id, listing.id, 30, database, AT)
    ).rejects.toThrow("You do not look after that listing.")
  })

  it("falls back to thirty days for an unknown range", async () => {
    const { listing, owner } = await approvedListing()
    await dailyFact(alpha, listing.slug, "2026-07-24", 4)
    await dailyFact(alpha, listing.slug, "2026-07-04", 7)

    const analytics = await readOwnerListingViews(
      owner.id,
      listing.id,
      "60",
      database,
      AT
    )

    expect(analytics).toMatchObject({
      days: 30,
      total: 4,
      previousTotal: 7,
    })
  })

  it("keeps uncounted days absent and reports the busiest recorded day", async () => {
    const { listing, owner } = await approvedListing()
    await dailyFact(alpha, listing.slug, "2026-08-01", 2)
    await dailyFact(alpha, listing.slug, "2026-08-08", 9)
    await dailyFact(beta, listing.slug, "2026-08-08", 50)

    const analytics = await readOwnerListingViews(
      owner.id,
      listing.id,
      30,
      database,
      AT
    )

    expect(analytics.daily).toEqual([
      { day: "2026-08-01", views: 2 },
      { day: "2026-08-08", views: 9 },
    ])
    expect(analytics.total).toBe(11)
    expect(analytics.busiestDay).toEqual({ day: "2026-08-08", views: 9 })
  })
})
