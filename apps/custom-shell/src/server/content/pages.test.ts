import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { publicPages } from "@/lib/pages/page-registry"
import {
  loadPagesOverview,
  PAGES_VISIT_DAYS,
  readPublicNotFoundDiscovery,
  readPageVisibility,
  setPageVisibility,
} from "@/server/content/pages"
import { parseWorkspaceSettings } from "@/server/people/workspaces"
import {
  customShellSettings,
  customShellTrafficDailyFacts,
  customShellWorkspaces,
} from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The Pages dashboard's read: the page registry joined to the traffic
 * counters. The contract that matters is registry-first — every declared
 * page gets a row whether or not anybody ever visited it, and an address
 * the tracker counted but nobody declared never sneaks in.
 */

let client: PGlite
let database: TestDatabase
/** The site every page in these tests belongs to. */
let site: string

// A fixed moment so the day arithmetic in these tests never depends on when
// they run.
const at = new Date("2026-08-05T12:00:00Z")

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

/** What this site has actually stored about which pages are hidden. */
async function savedPageMap() {
  const [row] = await database
    .select({ settings: customShellWorkspaces.settings })
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, site))
    .limit(1)
  return parseWorkspaceSettings(row?.settings).pages
}

function factRow(day: string, key: string, views: number) {
  return { workspaceId: site, day, dimension: "path", key, views }
}

describe("readPublicNotFoundDiscovery", () => {
  it("uses the app-wide links for one site and keeps search separate", async () => {
    await database
      .update(customShellWorkspaces)
      .set({
        settings: {
          publicNavigation: [
            { type: "search" },
            { label: "Workspace", href: "/workspace" },
          ],
        },
      })
      .where(eq(customShellWorkspaces.id, site))
    await database.insert(customShellSettings).values({
      key: "default",
      settings: {
        publicNavigation: [
          { type: "search" },
          { label: "App", href: "/app" },
        ],
      },
      createdAt: at,
      updatedAt: at,
    })

    const savedBaseDomain = process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN
    try {
      process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN = ""
      expect(await readPublicNotFoundDiscovery(site, database)).toMatchObject({
        publicNavigation: [{ label: "App", href: "/app" }],
        publicSearchEnabled: true,
      })

      process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN = "localhost"
      expect(await readPublicNotFoundDiscovery(site, database)).toMatchObject({
        publicNavigation: [{ label: "Workspace", href: "/workspace" }],
        publicSearchEnabled: true,
      })
    } finally {
      process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN = savedBaseDomain
    }
  })
})

describe("loadPagesOverview", () => {
  it("has a row for every registered page even with no traffic at all", async () => {
    const overview = await loadPagesOverview(site, database, at)

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
    const overview = await loadPagesOverview(site, database, at)

    expect(overview.visitDays).toBe(PAGES_VISIT_DAYS)
  })

  it("counts the oldest day in the window and not the one before it", async () => {
    // The two edges of the window the field above advertises. Written as
    // dates rather than arithmetic so a wrong window fails here loudly.
    await database.insert(customShellTrafficDailyFacts).values([
      factRow("2026-07-07", "/pricing", 5), // 30th day back — inside
      factRow("2026-07-06", "/pricing", 99), // 31st day back — outside
    ])

    const overview = await loadPagesOverview(site, database, at)
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
      {
        workspaceId: site,
        day: "2026-08-05",
        dimension: "referrer",
        key: "/pricing",
        views: 50,
      },
      // An address the tracker saw but no page declares gets no row at all.
      factRow("2026-08-05", "/no-such-page", 9),
    ])

    const overview = await loadPagesOverview(site, database, at)
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

    const overview = await loadPagesOverview(site, database, at)

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

    const overview = await loadPagesOverview(site, database, at)

    expect(overview.approximate).toBe(false)
  })
})

describe("changing who can see a page", () => {
  it("starts with every page open and nothing stored", async () => {
    const overview = await loadPagesOverview(site, database, at)

    expect(overview.rows.every((row) => row.visibility === "everyone")).toBe(
      true
    )
    // The point of the default: an install nobody has configured has no row
    // about pages at all.
    expect(await savedPageMap()).toEqual({})
  })

  it("saves a change and reads it back everywhere", async () => {
    await setPageVisibility(site, { path: "/pricing", visibility: "members" },
      database
    )

    expect(await readPageVisibility(site, "/pricing", database)).toBe("members")

    const overview = await loadPagesOverview(site, database, at)
    const pricing = overview.rows.find((row) => row.path === "/pricing")
    expect(pricing?.visibility).toBe("members")
    // Everything else is untouched.
    expect(
      overview.rows.filter((row) => row.path !== "/pricing").every(
        (row) => row.visibility === "everyone"
      )
    ).toBe(true)
  })

  it("forgets the page entirely when it goes back to everyone", async () => {
    await setPageVisibility(site, { path: "/pricing", visibility: "off" }, database)
    expect(await savedPageMap()).toEqual({
      "/pricing": { visibility: "off" },
    })

    await setPageVisibility(site, { path: "/pricing", visibility: "everyone" },
      database
    )

    // Not `{ "/pricing": { visibility: "everyone" } }` — back to normal means
    // nothing stored, the same state as never having been touched.
    expect(await savedPageMap()).toEqual({})
  })

  it("refuses to hide a page the app cannot live without", async () => {
    // The screen greys these out; this is the same refusal on the server, so
    // a hand-made request cannot lock everyone out of their own app.
    await expect(
      setPageVisibility(site, { path: "/login", visibility: "off" }, database)
    ).rejects.toThrow("cannot be hidden")

    expect(await readPageVisibility(site, "/login", database)).toBe("everyone")
    expect(await savedPageMap()).toEqual({})
  })

  it("refuses an address no page declares", async () => {
    await expect(
      setPageVisibility(site, { path: "/nope", visibility: "off" }, database)
    ).rejects.toThrow("no public page")
  })

  it("leaves the site's other settings alone", async () => {
    // This writes into the one column that holds every setting a site has, so
    // the read-merge-write has to keep what it did not come to change.
    const [beforeRow] = await database
      .select({ settings: customShellWorkspaces.settings })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, site))
      .limit(1)
    const before = parseWorkspaceSettings(beforeRow?.settings)

    await setPageVisibility(site, { path: "/pricing", visibility: "off" }, database)

    const [afterRow] = await database
      .select({ settings: customShellWorkspaces.settings })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, site))
      .limit(1)
    const after = parseWorkspaceSettings(afterRow?.settings)
    expect({ ...after, pages: before.pages }).toEqual(before)
  })

  it("hides a page on one site and leaves the other site's alone", async () => {
    // The reason this moved off the app-wide settings row: keyed by the bare
    // address, one site closing its pricing page closed every site's.
    const other = (await insertWorkspace(database)).id

    await setPageVisibility(site, { path: "/pricing", visibility: "off" }, database)

    expect(await readPageVisibility(site, "/pricing", database)).toBe("off")
    expect(await readPageVisibility(other, "/pricing", database)).toBe("everyone")
  })

  it("answers everyone for an address that is not a page at all", async () => {
    expect(await readPageVisibility(site, "/admin/pages", database)).toBe("everyone")
  })
})
