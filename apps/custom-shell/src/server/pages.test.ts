import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { publicPages } from "@/lib/pages/page-registry"
import { loadPagesOverview, PAGES_VISIT_DAYS } from "@/server/pages"
import { customShellTrafficDailyFacts } from "@/server/schema"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"

/**
 * The Pages dashboard's read: the page registry joined to the traffic
 * counters. The contract that matters is registry-first — every declared
 * page gets a row whether or not anybody ever visited it, and an address
 * the tracker counted but nobody declared never sneaks in.
 */

let client: PGlite
let database: TestDatabase

// A fixed moment so the day arithmetic in these tests never depends on when
// they run.
const at = new Date("2026-08-05T12:00:00Z")

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

function factRow(day: string, key: string, views: number) {
  return { day, dimension: "path", key, views }
}

describe("loadPagesOverview", () => {
  it("has a row for every registered page even with no traffic at all", async () => {
    const overview = await loadPagesOverview(database, at)

    expect(overview.rows.map((row) => row.path)).toEqual(
      publicPages().map((page) => page.path)
    )
    expect(overview.rows.every((row) => row.visits === 0)).toBe(true)
    expect(overview.approximate).toBe(false)
  })

  it("reports the window it counted, so the heading cannot drift from it", async () => {
    // The column heading is built from this field rather than from a second
    // copy of the number written into the screen, so the two can never
    // disagree about how far back "Visits" goes.
    const overview = await loadPagesOverview(database, at)

    expect(overview.visitDays).toBe(PAGES_VISIT_DAYS)
  })

  it("counts the oldest day in the window and not the one before it", async () => {
    // The two edges of the window the field above advertises. Written as
    // dates rather than arithmetic so a wrong window fails here loudly.
    await database.insert(customShellTrafficDailyFacts).values([
      factRow("2026-07-07", "/pricing", 5), // 30th day back — inside
      factRow("2026-07-06", "/pricing", 99), // 31st day back — outside
    ])

    const overview = await loadPagesOverview(database, at)
    const pricing = overview.rows.find((row) => row.path === "/pricing")

    expect(pricing?.visits).toBe(5)
  })

  it("sums a page's visits inside the 30-day window and ignores the rest", async () => {
    await database.insert(customShellTrafficDailyFacts).values([
      factRow("2026-08-05", "/pricing", 3),
      factRow("2026-07-08", "/pricing", 4),
      // The 31st day back — one outside a 30-day window ending today.
      factRow("2026-07-06", "/pricing", 100),
      // Another dimension's counter for a look-alike key stays out of it.
      { day: "2026-08-05", dimension: "referrer", key: "/pricing", views: 50 },
      // An address the tracker saw but no page declares gets no row at all.
      factRow("2026-08-05", "/no-such-page", 9),
    ])

    const overview = await loadPagesOverview(database, at)
    const byPath = new Map(overview.rows.map((row) => [row.path, row]))

    expect(byPath.get("/pricing")?.visits).toBe(7)
    expect(byPath.has("/no-such-page")).toBe(false)
    // Everything else stays at zero, present all the same.
    expect(byPath.get("/login")?.visits).toBe(0)
  })

  it("says so when a busy day overflowed the per-address counters", async () => {
    await database
      .insert(customShellTrafficDailyFacts)
      .values([factRow("2026-08-05", "(other)", 500)])

    const overview = await loadPagesOverview(database, at)

    expect(overview.approximate).toBe(true)
    // The overflow bucket is a caveat, never a row.
    expect(
      overview.rows.some((row) => row.path === "(other)")
    ).toBe(false)
  })

  it("keeps the overflow caveat inside the window too", async () => {
    // The 31st day back — just outside the window.
    await database
      .insert(customShellTrafficDailyFacts)
      .values([factRow("2026-07-06", "(other)", 500)])

    const overview = await loadPagesOverview(database, at)

    expect(overview.approximate).toBe(false)
  })
})
