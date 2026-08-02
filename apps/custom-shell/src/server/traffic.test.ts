import { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  customShellTrafficDailyFacts,
  customShellTrafficDailyTotals,
  customShellTrafficDaySalts,
  customShellTrafficVisitors,
  customShellTrafficVisits,
} from "@/server/schema"
import { createTestDatabase } from "@/server/test-support"
import {
  classifyDevice,
  FACT_KEY_CAPS,
  getDaySalt,
  hashVisitor,
  isBotUserAgent,
  isPrefetchPurpose,
  loadTrafficSummary,
  normalizeReferrer,
  normalizeTrafficPath,
  OTHER_KEY,
  pruneTrafficData,
  recordVisit,
  resetTrafficSweepForTests,
  trafficDay,
  type VisitInput,
} from "@/server/traffic"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db as unknown as CustomShellDb
  resetTrafficSweepForTests()
})

afterEach(async () => {
  await client.close()
})

const NOON = new Date("2026-08-02T12:00:00Z")

function visit(overrides: Partial<VisitInput> = {}): VisitInput {
  return {
    path: "/pricing",
    referrerDomain: "direct",
    device: "computer",
    audience: "visitor",
    visitorHash: "hash-a",
    ...overrides,
  }
}

describe("traffic filters and normalizers", () => {
  it("treats crawlers, scripts, and a missing user agent as bots", () => {
    expect(isBotUserAgent(null)).toBe(true)
    expect(isBotUserAgent("")).toBe(true)
    expect(isBotUserAgent("Googlebot/2.1")).toBe(true)
    expect(isBotUserAgent("curl/8.0")).toBe(true)
    expect(isBotUserAgent("python-requests/2.31")).toBe(true)
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15"
      )
    ).toBe(false)
  })

  it("recognises a prefetching browser by its purpose header", () => {
    expect(isPrefetchPurpose("prefetch")).toBe(true)
    expect(isPrefetchPurpose("prefetch;prerender")).toBe(true)
    expect(isPrefetchPurpose(null)).toBe(false)
    expect(isPrefetchPurpose("")).toBe(false)
    expect(isPrefetchPurpose("navigate")).toBe(false)
  })

  it("sorts phones, tablets, and computers by user agent", () => {
    expect(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe(
      "phone"
    )
    expect(
      classifyDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile")
    ).toBe("phone")
    expect(classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet")
    expect(classifyDevice("Mozilla/5.0 (Linux; Android 14; SM-X910)")).toBe(
      "tablet"
    )
    expect(
      classifyDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
    ).toBe("computer")
  })

  it("keeps only the path — query and hash stripped, length capped", () => {
    expect(normalizeTrafficPath("/pricing?utm_source=x#top")).toBe("/pricing")
    expect(normalizeTrafficPath(`/${"a".repeat(400)}`)).toHaveLength(160)
    expect(normalizeTrafficPath("/")).toBe("/")
  })

  it("refuses junk, API calls, and things that are not paths", () => {
    expect(normalizeTrafficPath("https://evil.example/page")).toBeNull()
    expect(normalizeTrafficPath("pricing")).toBeNull()
    expect(normalizeTrafficPath("/api/v1/traffic/view")).toBeNull()
    expect(normalizeTrafficPath("/api")).toBeNull()
    expect(normalizeTrafficPath(42)).toBeNull()
    expect(normalizeTrafficPath(undefined)).toBeNull()
  })

  it("reduces a referrer to its site name, or 'direct'", () => {
    expect(normalizeReferrer("https://www.google.com/search?q=x", "my.app")).toBe(
      "www.google.com"
    )
    expect(normalizeReferrer("", "my.app")).toBe("direct")
    expect(normalizeReferrer("not a url", "my.app")).toBe("direct")
    expect(normalizeReferrer("https://my.app/other-page", "my.app")).toBe(
      "direct"
    )
    expect(normalizeReferrer(undefined, "my.app")).toBe("direct")
  })
})

describe("recording visits", () => {
  it("writes the totals row, three fact rows, and the visit log row", async () => {
    await recordVisit(
      visit({ referrerDomain: "www.google.com", audience: "member" }),
      database,
      NOON
    )

    const [totals] = await database
      .select()
      .from(customShellTrafficDailyTotals)
    expect(totals).toMatchObject({
      day: trafficDay(NOON),
      views: 1,
      memberViews: 1,
      visitorViews: 0,
      uniqueVisitors: 1,
    })

    const facts = await database
      .select()
      .from(customShellTrafficDailyFacts)
      .orderBy(asc(customShellTrafficDailyFacts.dimension))
    expect(facts).toHaveLength(3)
    expect(facts.map((row) => [row.dimension, row.key, row.views])).toEqual([
      ["device", "computer", 1],
      ["path", "/pricing", 1],
      ["referrer", "www.google.com", 1],
    ])

    const visits = await database.select().from(customShellTrafficVisits)
    expect(visits).toHaveLength(1)
    expect(visits[0]).toMatchObject({
      path: "/pricing",
      referrerDomain: "www.google.com",
      device: "computer",
      audience: "member",
    })
  })

  it("counts the same visitor once a day, and again the next day", async () => {
    await recordVisit(visit(), database, NOON)
    await recordVisit(visit({ path: "/about" }), database, NOON)

    const [totals] = await database.select().from(customShellTrafficDailyTotals)
    expect(totals).toMatchObject({ views: 2, uniqueVisitors: 1 })

    const nextDay = new Date("2026-08-03T12:00:00Z")
    await recordVisit(visit(), database, nextDay)

    const rows = await database
      .select()
      .from(customShellTrafficDailyTotals)
      .orderBy(asc(customShellTrafficDailyTotals.day))
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ views: 1, uniqueVisitors: 1 })
  })

  it("splits views between members and visitors, summing to the total", async () => {
    await recordVisit(visit({ audience: "member", visitorHash: "m1" }), database, NOON)
    await recordVisit(visit({ audience: "visitor", visitorHash: "v1" }), database, NOON)
    await recordVisit(visit({ audience: "visitor", visitorHash: "v2" }), database, NOON)

    const [totals] = await database.select().from(customShellTrafficDailyTotals)
    expect(totals).toMatchObject({
      views: 3,
      memberViews: 1,
      visitorViews: 2,
      uniqueVisitors: 3,
    })
    expect(totals!.memberViews + totals!.visitorViews).toBe(totals!.views)
  })

  it("lumps paths past the daily cap into (other) while known paths still count", async () => {
    // Fill the day to its cap with distinct paths, cheaply: straight inserts.
    await database.insert(customShellTrafficDailyFacts).values(
      Array.from({ length: FACT_KEY_CAPS.path }, (_, index) => ({
        day: trafficDay(NOON),
        dimension: "path",
        key: `/page-${index}`,
        views: 1,
      }))
    )

    // A brand-new path has no seat left.
    await recordVisit(visit({ path: "/page-new" }), database, NOON)
    // A path the day already knows keeps its own count.
    await recordVisit(visit({ path: "/page-7" }), database, NOON)

    const other = await database
      .select()
      .from(customShellTrafficDailyFacts)
      .where(eq(customShellTrafficDailyFacts.key, OTHER_KEY))
    expect(other).toEqual([
      expect.objectContaining({ dimension: "path", views: 1 }),
    ])

    const known = await database
      .select()
      .from(customShellTrafficDailyFacts)
      .where(eq(customShellTrafficDailyFacts.key, "/page-7"))
    expect(known[0]).toMatchObject({ views: 2 })
  })

  it("caps referrer sites the same way", async () => {
    await database.insert(customShellTrafficDailyFacts).values(
      Array.from({ length: FACT_KEY_CAPS.referrer }, (_, index) => ({
        day: trafficDay(NOON),
        dimension: "referrer",
        key: `site-${index}.example`,
        views: 1,
      }))
    )

    await recordVisit(visit({ referrerDomain: "new-site.example" }), database, NOON)

    const other = await database
      .select()
      .from(customShellTrafficDailyFacts)
      .where(eq(customShellTrafficDailyFacts.key, OTHER_KEY))
    expect(other).toEqual([
      expect.objectContaining({ dimension: "referrer", views: 1 }),
    ])
  })
})

describe("the daily salt and visitor hash", () => {
  it("mints one salt per day and hands the same one back", async () => {
    const first = await getDaySalt(trafficDay(NOON), database)
    const again = await getDaySalt(trafficDay(NOON), database)

    expect(first).toHaveLength(64)
    expect(again).toBe(first)

    const rows = await database.select().from(customShellTrafficDaySalts)
    expect(rows).toHaveLength(1)
  })

  it("hashes the same browser to the same value, different browsers apart", () => {
    const salt = "s".repeat(64)
    expect(hashVisitor(salt, "1.2.3.4", "Safari")).toBe(
      hashVisitor(salt, "1.2.3.4", "Safari")
    )
    expect(hashVisitor(salt, "1.2.3.4", "Safari")).not.toBe(
      hashVisitor(salt, "5.6.7.8", "Safari")
    )
    // A different day's salt makes yesterday's hash unrecognizable.
    expect(hashVisitor("t".repeat(64), "1.2.3.4", "Safari")).not.toBe(
      hashVisitor(salt, "1.2.3.4", "Safari")
    )
  })
})

describe("pruning", () => {
  it("deletes old visits, hashes, and salts without touching any frozen count", async () => {
    await recordVisit(visit(), database, NOON)
    await recordVisit(visit({ visitorHash: "hash-b" }), database, NOON)

    const before = await database.select().from(customShellTrafficDailyTotals)
    expect(before[0]).toMatchObject({ views: 2, uniqueVisitors: 2 })

    // Eight days later, everything scaffolding-shaped is out of its window.
    const later = new Date("2026-08-10T12:00:00Z")
    await pruneTrafficData(database, later)

    expect(await database.select().from(customShellTrafficVisits)).toEqual([])
    expect(await database.select().from(customShellTrafficVisitors)).toEqual([])
    expect(await database.select().from(customShellTrafficDaySalts)).toEqual([])

    // The counters are exactly as they were frozen.
    const after = await database.select().from(customShellTrafficDailyTotals)
    expect(after).toEqual(before)
    const facts = await database.select().from(customShellTrafficDailyFacts)
    expect(facts).toHaveLength(3)
  })

  it("keeps visits still inside the log window", async () => {
    await recordVisit(visit(), database, NOON)

    const twoDaysLater = new Date("2026-08-04T12:00:00Z")
    await pruneTrafficData(database, twoDaysLater)

    expect(await database.select().from(customShellTrafficVisits)).toHaveLength(1)
    // But the finished day's hash and salt rows are already gone.
    expect(await database.select().from(customShellTrafficVisitors)).toEqual([])
    expect(await database.select().from(customShellTrafficDaySalts)).toEqual([])
  })
})

describe("the summary the dashboard reads", () => {
  it("zero-fills missing days and sorts (other) last", async () => {
    await recordVisit(
      visit({ audience: "member", referrerDomain: "big-site.example" }),
      database,
      new Date("2026-08-01T12:00:00Z")
    )
    await recordVisit(visit({ visitorHash: "hash-b" }), database, NOON)
    // A hand-planted overflow bucket that would otherwise sort first.
    await database.insert(customShellTrafficDailyFacts).values({
      day: trafficDay(NOON),
      dimension: "referrer",
      key: OTHER_KEY,
      views: 99,
    })

    const summary = await loadTrafficSummary(7, database, NOON)

    expect(summary.totals).toEqual({
      views: 2,
      memberViews: 1,
      visitorViews: 1,
      uniqueVisitors: 2,
    })
    expect(summary.viewsToday).toBe(1)
    expect(summary.daily).toHaveLength(7)
    expect(summary.daily[0].day).toBe("2026-07-27")
    expect(summary.daily.at(-1)).toEqual({
      day: "2026-08-02",
      memberViews: 0,
      visitorViews: 1,
    })
    // Five quiet days in between stay visible as zeroes.
    expect(
      summary.daily.filter((point) => !point.memberViews && !point.visitorViews)
    ).toHaveLength(5)

    expect(summary.topPages).toEqual([{ key: "/pricing", views: 2 }])
    expect(summary.topReferrers.map((row) => row.key)).toEqual([
      "big-site.example",
      "direct",
      OTHER_KEY,
    ])
    expect(summary.devices).toEqual([{ key: "computer", views: 2 }])
  })

  it("leaves days outside the range out of the totals", async () => {
    await recordVisit(visit(), database, new Date("2026-07-01T12:00:00Z"))
    await recordVisit(visit({ visitorHash: "hash-b" }), database, NOON)

    const summary = await loadTrafficSummary(7, database, NOON)

    expect(summary.totals.views).toBe(1)
    expect(summary.daily).toHaveLength(7)
  })
})
