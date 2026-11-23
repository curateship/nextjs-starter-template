import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setDbForTests, type CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"
import {
  analyticDailySiteStats,
  analyticEvents,
  customShellUsers,
} from "@/server/schema"
import { getSiteAudience } from "@/server/audience"
import { getSiteOverview } from "@/server/overview"
import {
  cleanPagePath,
  extractReferrerDomain,
  ingestBatch,
  prepareBatch,
  resolveOccurredAt,
  toUtcDay,
  type EventDimensions,
} from "@/server/ingest"
import { parseUserAgent, readCountryCode } from "@/server/user-agent"
import {
  cleanDomain,
  createUserSite,
  resolveSiteByPublicId,
  siteHasEvents,
} from "@/server/sites"
import { now, uuid } from "@/server/security"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

async function applyMigration(name: string) {
  const sql = await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8")
  await client.exec(sql)
}

beforeEach(async () => {
  client = new PGlite()
  await applyMigration("0000_custom_shell_baseline.sql")
  await applyMigration("0003_custom_shell_workspaces.sql")
  await applyMigration("0004_analytic_sites_events.sql")
  await applyMigration("0005_analytic_audience_dimensions.sql")
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as CustomShellDb)
})

const DIMS: EventDimensions = {
  device: "computer",
  browser: "Chrome",
  country: "US",
}

afterEach(async () => {
  await client.close()
})

async function seedUser() {
  const userId = uuid()
  const createdAt = now()
  await database.insert(customShellUsers).values({
    id: userId,
    email: `${userId}@internal.dev`,
    name: "Owner",
    role: "admin",
    passwordHash: "hash",
    createdAt,
    updatedAt: createdAt,
  })
  return userId
}

describe("ingest normalization helpers", () => {
  it("keeps only the pathname of a page path", () => {
    expect(cleanPagePath("/blog/post?utm=x#top")).toBe("/blog/post")
    expect(cleanPagePath("https://evil.com/steal")).toBe("/steal")
    expect(cleanPagePath(undefined)).toBeNull()
    expect(cleanPagePath("x".repeat(3000))).toBeNull()
  })

  it("returns external referrer domains and drops same-site ones", () => {
    expect(extractReferrerDomain("https://www.google.com/search", "example.com")).toBe(
      "google.com"
    )
    expect(extractReferrerDomain("https://example.com/a", "example.com")).toBeNull()
    expect(extractReferrerDomain("not a url", "example.com")).toBeNull()
    expect(extractReferrerDomain(undefined, "example.com")).toBeNull()
  })

  it("only trusts a client timestamp within a day of now", () => {
    const reference = new Date("2026-07-16T12:00:00.000Z")
    const close = new Date("2026-07-16T06:00:00.000Z").toISOString()
    expect(resolveOccurredAt(close, reference).toISOString()).toBe(close)

    const farFuture = new Date("2027-01-01T00:00:00.000Z").toISOString()
    expect(resolveOccurredAt(farFuture, reference)).toEqual(reference)
    expect(resolveOccurredAt("garbage", reference)).toEqual(reference)
  })

  it("uses the UTC day boundary", () => {
    expect(toUtcDay(new Date("2026-07-16T23:30:00.000Z"))).toBe("2026-07-16")
  })
})

describe("prepareBatch aggregation", () => {
  it("sums page views and counts a unique visitor once per day", () => {
    const reference = new Date("2026-07-16T12:00:00.000Z")
    const { prepared, groups, rejected } = prepareBatch(
      [
        { type: "pageview", page_path: "/", daily_visitor: true },
        { type: "pageview", page_path: "/", referrer: "https://google.com" },
        { type: "pageview", page_path: "/about", daily_visitor: true },
        { type: "click", page_path: "/" },
        { type: "pageview", page_path: undefined },
      ],
      "example.com",
      DIMS,
      reference
    )

    expect(prepared).toHaveLength(3)
    expect(rejected).toBe(2)

    const day = groups.get("2026-07-16")
    expect(day?.pageViews).toBe(3)
    expect(day?.visitors).toBe(1) // second daily_visitor in same request not double-counted
    expect(day?.pages).toEqual({ "/": 2, "/about": 1 })
    expect(day?.referrers).toEqual({ "google.com": 1 })
  })

  it("counts dimensions per visitor, not per view", () => {
    const reference = new Date("2026-07-16T12:00:00.000Z")
    const { groups } = prepareBatch(
      [
        { type: "pageview", page_path: "/", daily_visitor: true },
        { type: "pageview", page_path: "/about" },
        { type: "pageview", page_path: "/pricing" },
      ],
      "example.com",
      { device: "phone", browser: "Safari", country: null },
      reference
    )

    const day = groups.get("2026-07-16")
    expect(day?.pageViews).toBe(3)
    expect(day?.devices).toEqual({ phone: 1 })
    expect(day?.browsers).toEqual({ Safari: 1 })
    expect(day?.countries).toEqual({ Unknown: 1 })
  })

  it("skips dimension counters entirely for returning-visitor batches", () => {
    const reference = new Date("2026-07-16T12:00:00.000Z")
    const { groups } = prepareBatch(
      [{ type: "pageview", page_path: "/" }],
      "example.com",
      DIMS,
      reference
    )

    const day = groups.get("2026-07-16")
    expect(day?.visitors).toBe(0)
    expect(day?.devices).toEqual({})
    expect(day?.browsers).toEqual({})
    expect(day?.countries).toEqual({})
  })
})

describe("ingestBatch storage", () => {
  it("stores raw events and daily totals, and merges a second batch", async () => {
    const userId = await seedUser()
    const site = await createUserSite(userId, {
      name: "Blog",
      domain: "example.com",
    })
    const reference = new Date("2026-07-16T12:00:00.000Z")

    const first = await ingestBatch(
      site.id,
      "example.com",
      [
        { type: "pageview", page_path: "/", daily_visitor: true },
        { type: "pageview", page_path: "/about", referrer: "https://google.com" },
        { type: "junk", page_path: "/" },
      ],
      DIMS,
      database as unknown as CustomShellDb,
      reference
    )
    expect(first).toEqual({ stored: 2, rejected: 1 })

    const events = await database
      .select()
      .from(analyticEvents)
      .where(eq(analyticEvents.siteId, site.id))
    expect(events).toHaveLength(2)
    expect(events[0].device).toBe("computer")
    expect(events[0].browser).toBe("Chrome")
    expect(events[0].country).toBe("US")

    const second = await ingestBatch(
      site.id,
      "example.com",
      [{ type: "pageview", page_path: "/", daily_visitor: true }],
      { device: "phone", browser: "Safari", country: null },
      database as unknown as CustomShellDb,
      reference
    )
    expect(second.stored).toBe(1)

    const [daily] = await database
      .select()
      .from(analyticDailySiteStats)
      .where(eq(analyticDailySiteStats.siteId, site.id))

    expect(daily.pageViews).toBe(3)
    expect(daily.visitors).toBe(2)
    expect(daily.pages).toEqual({ "/": 2, "/about": 1 })
    expect(daily.referrers).toEqual({ "google.com": 1 })
    expect(daily.devices).toEqual({ computer: 1, phone: 1 })
    expect(daily.browsers).toEqual({ Chrome: 1, Safari: 1 })
    expect(daily.countries).toEqual({ US: 1, Unknown: 1 })
    expect(await siteHasEvents(site.id)).toBe(true)
  })
})

describe("user-agent classification", () => {
  it("classifies device and browser from common user agents", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      )
    ).toEqual({ device: "computer", browser: "Chrome" })

    expect(
      parseUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      )
    ).toEqual({ device: "phone", browser: "Safari" })

    expect(
      parseUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      )
    ).toEqual({ device: "tablet", browser: "Safari" })

    // Android tablet: Android without "Mobile".
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      ).device
    ).toBe("tablet")

    // Edge and Samsung Internet both contain "Chrome".
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"
      ).browser
    ).toBe("Edge")
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36"
      )
    ).toEqual({ device: "phone", browser: "Samsung Internet" })

    expect(
      parseUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"
      )
    ).toEqual({ device: "computer", browser: "Firefox" })

    expect(parseUserAgent("")).toEqual({ device: "computer", browser: "Other" })
    expect(parseUserAgent(null)).toEqual({
      device: "computer",
      browser: "Other",
    })

    // Attacker-sized strings are capped before the regexes run.
    expect(parseUserAgent("Android ".repeat(4000)).device).toBe("tablet")
    expect(
      parseUserAgent(`${"x".repeat(600)} Chrome/126.0 Safari/537.36`).browser
    ).toBe("Other")
  })

  it("reads only plausible Cloudflare country codes", () => {
    expect(readCountryCode(new Headers({ "cf-ipcountry": "US" }))).toBe("US")
    expect(readCountryCode(new Headers({ "cf-ipcountry": "de" }))).toBe("DE")
    expect(readCountryCode(new Headers({ "cf-ipcountry": "XX" }))).toBeNull()
    expect(readCountryCode(new Headers({ "cf-ipcountry": "T1" }))).toBeNull()
    expect(readCountryCode(new Headers({ "cf-ipcountry": "USA" }))).toBeNull()
    expect(readCountryCode(new Headers())).toBeNull()
  })
})

describe("getSiteOverview", () => {
  async function seedDaily(
    siteId: string,
    day: string,
    pageViews: number,
    visitors: number,
    pages: Record<string, number> = {},
    referrers: Record<string, number> = {}
  ) {
    const createdAt = now()
    await database.insert(analyticDailySiteStats).values({
      id: uuid(),
      siteId,
      day,
      pageViews,
      visitors,
      pages,
      referrers,
      createdAt,
      updatedAt: createdAt,
    })
  }

  it("totals the range, compares to the previous period, and ranks breakdowns", async () => {
    const userId = await seedUser()
    const site = await createUserSite(userId, { name: "Blog", domain: "example.com" })

    // Previous period (2026-07-08 .. 07-09 for a 2-day window ending 07-11).
    await seedDaily(site.id, "2026-07-08", 100, 50)
    // Current window 07-10 .. 07-11.
    await seedDaily(site.id, "2026-07-10", 10, 5, { "/a": 6, "/b": 4 }, { "google.com": 3 })
    await seedDaily(
      site.id,
      "2026-07-11",
      20,
      8,
      { "/a": 15, "/c": 5 },
      { "google.com": 2, "x.com": 4 }
    )

    const overview = await getSiteOverview(userId, site.id, "2026-07-10", "2026-07-11")

    expect(overview.totals).toEqual({ pageViews: 30, visitors: 13 })
    expect(overview.previous).toEqual({ pageViews: 100, visitors: 50 })
    expect(overview.series).toEqual([
      { day: "2026-07-10", pageViews: 10, visitors: 5 },
      { day: "2026-07-11", pageViews: 20, visitors: 8 },
    ])
    expect(overview.topPages).toEqual([
      { key: "/a", count: 21 },
      { key: "/c", count: 5 },
      { key: "/b", count: 4 },
    ])
    expect(overview.topReferrers).toEqual([
      { key: "google.com", count: 5 },
      { key: "x.com", count: 4 },
    ])
  })

  it("zero-fills days with no data and stays empty for a fresh site", async () => {
    const userId = await seedUser()
    const site = await createUserSite(userId, { name: "Blog", domain: "example.com" })
    await seedDaily(site.id, "2026-07-11", 7, 3)

    const overview = await getSiteOverview(userId, site.id, "2026-07-10", "2026-07-12")
    expect(overview.series).toEqual([
      { day: "2026-07-10", pageViews: 0, visitors: 0 },
      { day: "2026-07-11", pageViews: 7, visitors: 3 },
      { day: "2026-07-12", pageViews: 0, visitors: 0 },
    ])
    expect(overview.totals).toEqual({ pageViews: 7, visitors: 3 })
    expect(overview.topPages).toEqual([])
  })

  it("refuses to read another user's site", async () => {
    const owner = await seedUser()
    const intruder = await seedUser()
    const site = await createUserSite(owner, { name: "Blog", domain: "example.com" })

    await expect(
      getSiteOverview(intruder, site.id, "2026-07-10", "2026-07-11")
    ).rejects.toThrow("Site not found")
  })
})

describe("getSiteAudience", () => {
  async function seedDailyAudience(
    siteId: string,
    day: string,
    devices: Record<string, number>,
    browsers: Record<string, number>,
    countries: Record<string, number>
  ) {
    const createdAt = now()
    await database.insert(analyticDailySiteStats).values({
      id: uuid(),
      siteId,
      day,
      pageViews: 0,
      visitors: 0,
      pages: {},
      referrers: {},
      devices,
      browsers,
      countries,
      createdAt,
      updatedAt: createdAt,
    })
  }

  it("sums and ranks the per-dimension rollups over the range", async () => {
    const userId = await seedUser()
    const site = await createUserSite(userId, {
      name: "Blog",
      domain: "example.com",
    })

    await seedDailyAudience(
      site.id,
      "2026-07-10",
      { phone: 3, computer: 2 },
      { Chrome: 4, Safari: 1 },
      { US: 3, DE: 2 }
    )
    await seedDailyAudience(
      site.id,
      "2026-07-11",
      { phone: 1, tablet: 1 },
      { Chrome: 1, Firefox: 1 },
      { US: 1, Unknown: 1 }
    )
    // Outside the range — must not count.
    await seedDailyAudience(site.id, "2026-07-09", { phone: 9 }, {}, {})

    const audience = await getSiteAudience(
      userId,
      site.id,
      "2026-07-10",
      "2026-07-11"
    )

    expect(audience.devices).toEqual([
      { key: "phone", count: 4 },
      { key: "computer", count: 2 },
      { key: "tablet", count: 1 },
    ])
    expect(audience.browsers).toEqual([
      { key: "Chrome", count: 5 },
      { key: "Firefox", count: 1 },
      { key: "Safari", count: 1 },
    ])
    expect(audience.countries).toEqual([
      { key: "US", count: 4 },
      { key: "DE", count: 2 },
      { key: "Unknown", count: 1 },
    ])
  })

  it("refuses to read another user's site", async () => {
    const owner = await seedUser()
    const intruder = await seedUser()
    const site = await createUserSite(owner, {
      name: "Blog",
      domain: "example.com",
    })

    await expect(
      getSiteAudience(intruder, site.id, "2026-07-10", "2026-07-11")
    ).rejects.toThrow("Site not found")
  })
})

describe("site helpers", () => {
  it("normalizes domains and resolves sites by public id", async () => {
    expect(cleanDomain("https://www.Example.com/path")).toBe("example.com")

    const userId = await seedUser()
    const site = await createUserSite(userId, {
      name: "Blog",
      domain: "https://www.example.com",
    })
    expect(site.domain).toBe("example.com")
    expect(site.publicId).toHaveLength(32)

    const resolved = await resolveSiteByPublicId(site.publicId)
    expect(resolved).toEqual({ id: site.id, domain: "example.com" })
    expect(await resolveSiteByPublicId("nope")).toBeNull()
    expect(await siteHasEvents(site.id)).toBe(false)
  })
})
