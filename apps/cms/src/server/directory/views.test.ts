import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createListing } from "@/server/directory/listings"
import { uuid } from "@/server/auth/security"
import { listingViewCounts } from "@/server/directory/views"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import { loadTrafficSummary, recordVisit } from "@/server/traffic"

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
