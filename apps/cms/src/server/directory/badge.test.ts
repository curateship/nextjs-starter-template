import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { enforceRateLimit } from "@/server/auth/rate-limit"
import {
  LISTING_BADGE_CACHE,
  listingBadgeResponse,
  listingBadgeUnavailableResponse,
} from "@/server/directory/badge"
import {
  createListing,
  updateListing,
} from "@/server/directory/listings"
import { directoryListings } from "@/server/directory/schema"
import {
  directorySettingsFor,
  saveDirectoryBadgesEnabled,
  saveDirectorySettings,
} from "@/server/directory/settings"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase
let site: { id: string; name: string }

beforeEach(async () => {
  allow.mockClear()
  const test = await createTestDatabase()
  client = test.client
  database = test.db
  const workspace = await insertWorkspace(database, { name: "My Town" })
  site = { id: workspace.id, name: workspace.name }
})

afterEach(async () => {
  await client.close()
})

function request(query = "") {
  return new Request(`https://town.example.test/embed/listing/id${query}`)
}

async function publishedListing() {
  const listing = await createListing(
    site.id,
    { title: "Joe's Diner" },
    database
  )
  await updateListing(
    site.id,
    listing.id,
    {
      status: "published",
      featuredImage: "https://img.test/joe.jpg",
    },
    database
  )
  return listing
}

async function enableBadges() {
  await saveDirectoryBadgesEnabled(site.id, true, database)
}

const allow = vi.fn(async (..._args: Parameters<typeof enforceRateLimit>) => {})

describe("listing badge response", () => {
  it("changes the badge switch without overwriting claim settings", async () => {
    await saveDirectorySettings(
      site.id,
      { claimsEnabled: false, claimButtonLabel: "Ask us" },
      database
    )
    await saveDirectoryBadgesEnabled(site.id, true, database)

    const settings = await directorySettingsFor(site.id, database)
    expect(settings.badgesEnabled).toBe(true)
    expect(settings.claimsEnabled).toBe(false)
    expect(settings.claimButtonLabel).toBe("Ask us")
  })

  it("is off by default and returns a plain cached not-found", async () => {
    const listing = await publishedListing()
    const result = await listingBadgeResponse({
      request: request(),
      site,
      listingId: listing.id,
      requestAddress: "203.0.113.7",
      database,
      limit: allow,
    })

    expect(result.status).toBe(404)
    expect(await result.text()).toBe("Not found")
    expect(result.headers.get("cache-control")).toContain("s-maxage=300")
    expect(allow).not.toHaveBeenCalled()
  })

  it("serves a published listing with hard caching and no cookie", async () => {
    const listing = await publishedListing()
    await enableBadges()
    const result = await listingBadgeResponse({
      request: request("?size=card&theme=dark"),
      site,
      listingId: listing.id,
      requestAddress: "203.0.113.7",
      database,
      limit: allow,
    })
    const html = await result.text()

    expect(result.status).toBe(200)
    expect(result.headers.get("cache-control")).toBe(LISTING_BADGE_CACHE)
    expect(result.headers.get("set-cookie")).toBeNull()
    expect(result.headers.get("content-security-policy")).toContain(
      "frame-ancestors *"
    )
    expect(html).toContain("Joe&#39;s Diner")
    expect(html).toContain("background:#18181b")
  })

  it("returns the same plain not-found for a draft or deleted listing", async () => {
    await enableBadges()
    const draft = await createListing(site.id, { title: "Draft" }, database)

    const draftResult = await listingBadgeResponse({
      request: request(),
      site,
      listingId: draft.id,
      requestAddress: "203.0.113.7",
      database,
      limit: allow,
    })
    await database
      .delete(directoryListings)
      .where(eq(directoryListings.id, draft.id))
    const deletedResult = await listingBadgeResponse({
      request: request(),
      site,
      listingId: draft.id,
      requestAddress: "203.0.113.7",
      database,
      limit: allow,
    })

    expect(draftResult.status).toBe(404)
    expect(await draftResult.text()).toBe("Not found")
    expect(deletedResult.status).toBe(404)
    expect(await deletedResult.text()).toBe("Not found")
  })

  it("does not serve a published listing from another site", async () => {
    await enableBadges()
    const otherSite = await insertWorkspace(database, { name: "Other Town" })
    const listing = await createListing(
      otherSite.id,
      { title: "Other Cafe" },
      database
    )
    await updateListing(
      otherSite.id,
      listing.id,
      { status: "published" },
      database
    )

    const result = await listingBadgeResponse({
      request: request(),
      site,
      listingId: listing.id,
      requestAddress: "203.0.113.7",
      database,
      limit: allow,
    })

    expect(result.status).toBe(404)
    expect(await result.text()).toBe("Not found")
  })

  it("limits each checked address in its own bucket", async () => {
    const listing = await publishedListing()
    await enableBadges()
    const blocked = vi.fn(
      async (..._args: Parameters<typeof enforceRateLimit>) => {
        throw new Error("RATE_LIMITED")
      }
    )
    const result = await listingBadgeResponse({
      request: request(),
      site,
      listingId: listing.id,
      requestAddress: "198.51.100.12",
      database,
      limit: blocked,
    })

    expect(result.status).toBe(429)
    expect(result.headers.get("cache-control")).toBe("no-store")
    expect(result.headers.get("retry-after")).toBe("60")
    expect(blocked.mock.calls[0]?.[0]).toContain("198.51.100.12")
  })

  it("locks down an unexpected error response", async () => {
    const result = listingBadgeUnavailableResponse()

    expect(result.status).toBe(500)
    expect(result.headers.get("cache-control")).toBe("no-store")
    expect(result.headers.get("content-security-policy")).toContain(
      "default-src 'none'"
    )
  })
})
