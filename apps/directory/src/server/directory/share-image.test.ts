import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderListingShareImage } from "@/lib/directory/listing-share-image"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { createCategory } from "@/server/directory/categories"
import {
  createListing,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import type { VisitorSite } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  LISTING_SHARE_IMAGE_CACHE,
  listingShareImageResponse,
} from "@/server/directory/share-image"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase
let alpha: VisitorSite
let beta: VisitorSite

const allow = vi.fn(async (..._args: Parameters<typeof enforceRateLimit>) => {})

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

function request(path = "/directory/share-image/cafe") {
  return new Request(`https://alpha.example.test${path}`)
}

async function publish(site: VisitorSite, title: string, slug: string) {
  const listing = await createListing(site.id, { title, slug }, database)
  return updateListing(site.id, listing.id, { status: "published" }, database)
}

describe("listing share image response", () => {
  it("draws a published listing once and serves its canonical cached image", async () => {
    const category = await createCategory(
      alpha.id,
      { name: "Cafés", slug: "cafes" },
      database
    )
    const listing = await publish(alpha, "L'Étoile", "letoile")
    await setListingCategories(
      alpha.id,
      listing.id,
      [category.id],
      category.id,
      database
    )
    const draw = vi.fn(renderListingShareImage)

    const redirect = await listingShareImageResponse({
      request: request("/directory/share-image/letoile"),
      site: alpha,
      slug: "letoile",
      requestAddress: "203.0.113.7",
      database,
      limit: allow,
      draw,
    })
    const location = redirect.headers.get("location")
    expect(redirect.status).toBe(302)
    expect(location).toMatch(/^\/directory\/share-image\/letoile\?v=/)

    const image = await listingShareImageResponse({
      request: request(location ?? ""),
      site: alpha,
      slug: "letoile",
      requestAddress: "203.0.113.7",
      database,
      limit: allow,
      draw,
    })
    const svg = await image.text()

    expect(image.status).toBe(200)
    expect(image.headers.get("content-type")).toContain("image/svg+xml")
    expect(image.headers.get("cache-control")).toBe(LISTING_SHARE_IMAGE_CACHE)
    expect(image.headers.get("set-cookie")).toBeNull()
    expect(svg).toContain("L&#39;Étoile")
    expect(svg).toContain("CAFÉS")
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it("never draws another site's listing or an unpublished listing", async () => {
    await publish(beta, "Beta only", "same-address")
    await createListing(
      alpha.id,
      { title: "Private", slug: "private" },
      database
    )

    for (const slug of ["same-address", "private"]) {
      const result = await listingShareImageResponse({
        request: request(`/directory/share-image/${slug}`),
        site: alpha,
        slug,
        requestAddress: "203.0.113.7",
        database,
        limit: allow,
      })
      expect(result.status).toBe(404)
      expect(await result.text()).toBe("Not found")
    }
  })

  it("refuses markup in an address without echoing it", async () => {
    const result = await listingShareImageResponse({
      request: request("/directory/share-image/%3Cscript%3E"),
      site: alpha,
      slug: "<script>",
      requestAddress: "203.0.113.7",
      database,
      limit: allow,
    })

    expect(result.status).toBe(404)
    expect(await result.text()).toBe("Not found")
    expect(allow).not.toHaveBeenCalled()
  })

  it("returns a plain retryable answer when the public limit is reached", async () => {
    const limited = vi.fn(async () => {
      throw new Error("RATE_LIMITED")
    })
    const result = await listingShareImageResponse({
      request: request(),
      site: alpha,
      slug: "cafe",
      requestAddress: "203.0.113.7",
      database,
      limit: limited,
    })

    expect(result.status).toBe(429)
    expect(result.headers.get("retry-after")).toBe("60")
    expect(await result.text()).toBe("Too many requests")
  })
})
