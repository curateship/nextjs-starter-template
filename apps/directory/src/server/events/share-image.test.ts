import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderListingShareImage } from "@/lib/directory/listing-share-image"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { LISTING_SHARE_IMAGE_CACHE } from "@/server/directory/share-image"
import { createEvent, updateEvent } from "@/server/events/events"
import { eventShareImageResponse } from "@/server/events/share-image"
import { customShellWorkspaces } from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The drawn card an event without a cover photo is shared with: its title and
 * its date, for a published event on the visited site only.
 */

let client: PGlite
let database: TestDatabase
let alpha: VisitorSite
let beta: VisitorSite

const allow = vi.fn(async (..._args: Parameters<typeof enforceRateLimit>) => {})
const draw = vi.fn(renderListingShareImage)

beforeEach(async () => {
  allow.mockClear()
  resetPublicDirectoryCacheForTests()
  const test = await createTestDatabase()
  client = test.client
  database = test.db
  const alphaRow = await insertWorkspace(database, { name: "Alpha Guide" })
  const betaRow = await insertWorkspace(database, { name: "Beta Guide" })
  alpha = {
    id: alphaRow.id,
    name: alphaRow.name,
    url: "https://alpha.example.test",
    accentColor: "#c2410c",
  }
  beta = {
    id: betaRow.id,
    name: betaRow.name,
    url: "https://beta.example.test",
    accentColor: "#2563eb",
  }
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function event(
  site: VisitorSite,
  title: string,
  status: "draft" | "published" = "published"
) {
  const created = await createEvent(
    site.id,
    { title, when: { startDate: "2026-09-26", startTime: "18:00" } },
    database
  )
  return updateEvent(site.id, created.id, { status }, database)
}

function ask(site: VisitorSite, slug: string, path?: string) {
  return eventShareImageResponse({
    request: new Request(
      `https://alpha.example.test${path ?? `/events/share-image/${slug}`}`
    ),
    site,
    slug,
    requestAddress: "203.0.113.7",
    database,
    limit: allow,
    draw,
  })
}

describe("an event's share card", () => {
  it("draws the title and date once and serves it from its versioned address", async () => {
    draw.mockClear()
    const market = await event(alpha, "Night market")

    const redirect = await ask(alpha, market.slug)
    const location = redirect.headers.get("location")
    expect(redirect.status).toBe(302)
    expect(location).toMatch(/^\/events\/share-image\/night-market\?v=/)

    const image = await ask(alpha, market.slug, location ?? "")
    const svg = await image.text()
    expect(image.status).toBe(200)
    expect(image.headers.get("content-type")).toContain("image/svg+xml")
    expect(image.headers.get("cache-control")).toBe(LISTING_SHARE_IMAGE_CACHE)
    expect(svg).toContain("Night market")
    expect(svg).toContain("SAT, SEP 26 · 6:00 PM")
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it("never draws a draft or another site's event", async () => {
    await event(beta, "Beta only")
    await event(alpha, "Unfinished", "draft")

    for (const slug of ["beta-only", "unfinished"]) {
      const result = await ask(alpha, slug)
      expect(result.status).toBe(404)
    }
  })

  it("is not drawn while the Events page is not open to everyone", async () => {
    const market = await event(alpha, "Members market")
    await database
      .update(customShellWorkspaces)
      .set({ settings: { pages: { "/events": { visibility: "members" } } } })
      .where(eq(customShellWorkspaces.id, alpha.id))

    expect((await ask(alpha, market.slug)).status).toBe(404)
  })
})
