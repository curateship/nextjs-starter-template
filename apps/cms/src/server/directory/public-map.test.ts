import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DIRECTORY_MAP_LISTING_LIMIT } from "@/lib/directory/listing-map"
import { createCategory } from "@/server/directory/categories"
import {
  createListing,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"
import { readDirectoryMap, readPublicBrowse } from "@/server/directory/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import {
  saveDirectoryMapDisplayKey,
  saveDirectoryMapEnabled,
} from "@/server/directory/settings"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The map view, which is the browse list drawn differently — so the things
 * worth proving are the ways it could quietly stop being the same list.
 *
 * Two sites throughout, for the same reason the rest of the public reads use
 * two: a query missing its site filter passes every single-site test there is.
 */

let client: PGlite
let database: TestDatabase
let alpha: { id: string; name: string; url: string }
let beta: { id: string; name: string; url: string }

// The map key is stored encrypted like every other saved secret, so these tests
// need the same env value a running app has. Without it saving a key throws
// rather than storing plain text, which is the behaviour we want kept.
const ENCRYPTION_ENV = "CUSTOM_SHELL_SECRET_ENCRYPTION_KEY"
const originalSecret = process.env[ENCRYPTION_ENV]

beforeEach(async () => {
  process.env[ENCRYPTION_ENV] = "test-secret-any-string-works"
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db

  const alphaRow = await insertWorkspace(database, { name: "Alpha" })
  const betaRow = await insertWorkspace(database, { name: "Beta" })
  alpha = { id: alphaRow.id, name: "Alpha", url: "https://alpha.example.com" }
  beta = { id: betaRow.id, name: "Beta", url: "https://beta.example.com" }
})

afterEach(async () => {
  if (originalSecret === undefined) delete process.env[ENCRYPTION_ENV]
  else process.env[ENCRYPTION_ENV] = originalSecret
  resetPublicDirectoryCacheForTests()
  await client.close()
})

/** A published listing, optionally with somewhere to put it on a map. */
async function publish(
  site: { id: string },
  input: {
    title: string
    slug: string
    latitude?: number
    longitude?: number
  }
) {
  const listing = await createListing(
    site.id,
    { title: input.title, slug: input.slug },
    database
  )
  return updateListing(
    site.id,
    listing.id,
    {
      status: "published",
      ...(input.latitude !== undefined
        ? { latitude: input.latitude, longitude: input.longitude }
        : {}),
    },
    database
  )
}

/** A site that has both switched the map on and pasted a key for it. */
async function siteWithMap(site: { id: string }) {
  await saveDirectoryMapEnabled(site.id, true, database)
  await saveDirectoryMapDisplayKey(
    site.id,
    "not-a-real-browser-map-key",
    database
  )
}

describe("a site decides whether it has a map at all", () => {
  it("offers nothing until both the switch and the key are there", async () => {
    await publish(alpha, {
      title: "Pinned",
      slug: "pinned",
      latitude: 43.65,
      longitude: -79.38,
    })

    const nothing = await readPublicBrowse(
      alpha,
      { sort: "order", page: 1 },
      database
    )
    expect(nothing.mapAvailable).toBe(false)
    expect(await readDirectoryMap(alpha, {}, database)).toBeNull()

    await saveDirectoryMapEnabled(alpha.id, true, database)
    const switchedOn = await readPublicBrowse(
      alpha,
      { sort: "order", page: 1 },
      database
    )
    // Switched on with no key is not a map. Half of it would be a grey square.
    expect(switchedOn.mapAvailable).toBe(false)
    expect(await readDirectoryMap(alpha, {}, database)).toBeNull()

    await saveDirectoryMapDisplayKey(alpha.id, "not-a-real-key-9999", database)
    const ready = await readPublicBrowse(
      alpha,
      { sort: "order", page: 1 },
      database
    )
    expect(ready.mapAvailable).toBe(true)
    const map = await readDirectoryMap(alpha, {}, database)
    expect(map?.apiKey).toBe("not-a-real-key-9999")
    expect(map?.pins.map((pin) => pin.slug)).toEqual(["pinned"])
  })

  it("refuses a site that never switched it on, even asked directly", async () => {
    await siteWithMap(alpha)
    await publish(beta, {
      title: "Beta pinned",
      slug: "beta-pinned",
      latitude: 51.5,
      longitude: -0.12,
    })

    // Beta has listings with coordinates and no map. Asking Beta's map anyway
    // must not read them out.
    expect(await readDirectoryMap(beta, {}, database)).toBeNull()
  })
})

describe("the pins are the same results as the grid", () => {
  it("leaves out drafts, other sites, and listings with no location", async () => {
    await siteWithMap(alpha)
    await publish(alpha, {
      title: "Pinned",
      slug: "pinned",
      latitude: 43.65,
      longitude: -79.38,
    })
    await publish(alpha, { title: "No location", slug: "no-location" })
    await createListing(
      alpha.id,
      { title: "Draft", slug: "draft" },
      database
    ).then((listing) =>
      updateListing(
        alpha.id,
        listing.id,
        { latitude: 43.66, longitude: -79.39 },
        database
      )
    )
    await publish(beta, {
      title: "Beta",
      slug: "beta",
      latitude: 43.65,
      longitude: -79.38,
    })

    const map = await readDirectoryMap(alpha, {}, database)
    expect(map?.pins.map((pin) => pin.slug)).toEqual(["pinned"])
    expect(map?.total).toBe(1)
  })

  it("narrows to the same search and category the grid does", async () => {
    await siteWithMap(alpha)
    const category = await createCategory(
      alpha.id,
      { name: "Cafés", slug: "cafes" },
      database
    )
    const inside = await publish(alpha, {
      title: "Corner Cup",
      slug: "corner-cup",
      latitude: 43.65,
      longitude: -79.38,
    })
    await setListingCategories(
      alpha.id,
      inside.id,
      [category.id],
      category.id,
      database
    )
    await publish(alpha, {
      title: "Hardware Shop",
      slug: "hardware-shop",
      latitude: 43.66,
      longitude: -79.39,
    })

    const byCategory = await readDirectoryMap(
      alpha,
      { category: "cafes" },
      database
    )
    expect(byCategory?.pins.map((pin) => pin.slug)).toEqual(["corner-cup"])

    const bySearch = await readDirectoryMap(
      alpha,
      { search: "Hardware" },
      database
    )
    expect(bySearch?.pins.map((pin) => pin.slug)).toEqual(["hardware-shop"])
  })

  it("carries the card, so a pin opens the same thing a tile does", async () => {
    await siteWithMap(alpha)
    const category = await createCategory(
      alpha.id,
      { name: "Cafés", slug: "cafes" },
      database
    )
    const listing = await publish(alpha, {
      title: "Corner Cup",
      slug: "corner-cup",
      latitude: 43.65,
      longitude: -79.38,
    })
    await setListingCategories(
      alpha.id,
      listing.id,
      [category.id],
      category.id,
      database
    )
    await updateListing(alpha.id, listing.id, { rating: 4.5 }, database)

    const [pin] = (await readDirectoryMap(alpha, {}, database))?.pins ?? []
    expect(pin?.title).toBe("Corner Cup")
    expect(pin?.rating).toBe(4.5)
    expect(pin?.category?.name).toBe("Cafés")
    expect(pin?.latitude).toBe(43.65)
    expect(pin?.longitude).toBe(-79.38)
  })
})

describe("the saved page", () => {
  /*
   * The map is remembered like every other public page, and that is only safe
   * because a save forgets it again. Nothing here clears the cache by hand —
   * doing so is what would make this test pass whether or not the app does it.
   */
  it("shows a listing saved since the last visit", async () => {
    await siteWithMap(alpha)
    await publish(alpha, {
      title: "First",
      slug: "first",
      latitude: 43.65,
      longitude: -79.38,
    })

    const before = await readDirectoryMap(alpha, {}, database)
    expect(before?.pins.map((pin) => pin.slug)).toEqual(["first"])

    await publish(alpha, {
      title: "Second",
      slug: "second",
      latitude: 43.66,
      longitude: -79.39,
    })

    const after = await readDirectoryMap(alpha, {}, database)
    expect(after?.pins.map((pin) => pin.slug).sort()).toEqual([
      "first",
      "second",
    ])
    expect(after?.total).toBe(2)
  })

  it("forgets this site's map only, never another site's", async () => {
    await siteWithMap(alpha)
    await siteWithMap(beta)
    await publish(beta, {
      title: "Beta one",
      slug: "beta-one",
      latitude: 51.5,
      longitude: -0.12,
    })

    const betaBefore = await readDirectoryMap(beta, {}, database)
    expect(betaBefore?.pins).toHaveLength(1)

    // A save on Alpha must not be able to serve Beta a stale or foreign map.
    await publish(alpha, {
      title: "Alpha one",
      slug: "alpha-one",
      latitude: 43.65,
      longitude: -79.38,
    })

    const betaAfter = await readDirectoryMap(beta, {}, database)
    expect(betaAfter?.pins.map((pin) => pin.slug)).toEqual(["beta-one"])
  })
})

describe("the cap", () => {
  it("draws no more than the limit and still counts them all", async () => {
    await siteWithMap(alpha)
    for (let index = 0; index < DIRECTORY_MAP_LISTING_LIMIT + 1; index += 1) {
      await publish(alpha, {
        title: `Place ${index}`,
        slug: `place-${index}`,
        // Spread out enough to be distinct rows, close enough to be one city.
        latitude: 43.65 + index / 1_000,
        longitude: -79.38,
      })
    }

    const map = await readDirectoryMap(alpha, {}, database)
    expect(map?.pins).toHaveLength(DIRECTORY_MAP_LISTING_LIMIT)
    expect(map?.total).toBe(DIRECTORY_MAP_LISTING_LIMIT + 1)
  })
})
