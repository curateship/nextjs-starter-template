import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createListing, updateListing } from "@/server/directory/listings"
import {
  createSaveCollection,
  mostSavedListings,
  savedCollectionsForUser,
  saveImpactForListings,
  saveStateFor,
  setListingSaved,
} from "@/server/directory/saves"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => client.close())

async function published(workspaceId: string, title: string) {
  const row = await createListing(workspaceId, { title }, database)
  return updateListing(workspaceId, row.id, { status: "published" }, database)
}

describe("saved listings", () => {
  it("keeps the same account's folders separate by site", async () => {
    const user = await insertUser(database)
    const alpha = await insertWorkspace(database, { name: "Alpha" })
    const beta = await insertWorkspace(database, { name: "Beta" })
    const alphaListing = await published(alpha.id, "Alpha cafe")
    const betaListing = await published(beta.id, "Beta cafe")

    const alphaState = await saveStateFor(alpha.id, user.id, alphaListing.id, database)
    await setListingSaved(
      alpha.id,
      user.id,
      { collectionId: alphaState[0]!.id, listingId: alphaListing.id, saved: true },
      database
    )

    expect((await saveStateFor(beta.id, user.id, betaListing.id, database))[0]?.saved)
      .toBe(false)
    const saved = await savedCollectionsForUser(user.id, database)
    expect(saved.find((row) => row.siteId === alpha.id)?.items).toHaveLength(1)
    expect(saved.find((row) => row.siteId === beta.id)?.items).toHaveLength(0)
  })

  it("creates a named folder with the listing and removes it idempotently", async () => {
    const user = await insertUser(database)
    const site = await insertWorkspace(database)
    const listing = await published(site.id, "Bakery")

    const state = await createSaveCollection(
      site.id,
      user.id,
      { listingId: listing.id, name: "Weekend" },
      database
    )
    const weekend = state.find((row) => row.name === "Weekend")!
    expect(weekend.saved).toBe(true)

    await setListingSaved(
      site.id,
      user.id,
      { collectionId: weekend.id, listingId: listing.id, saved: false },
      database
    )
    await setListingSaved(
      site.id,
      user.id,
      { collectionId: weekend.id, listingId: listing.id, saved: false },
      database
    )
    expect(
      (await savedCollectionsForUser(user.id, database)).find(
        (row) => row.id === weekend.id
      )?.items
    ).toEqual([])
  })

  it("counts saves for the admin and delete warning", async () => {
    const [one, two] = await Promise.all([insertUser(database), insertUser(database)])
    const site = await insertWorkspace(database)
    const listing = await published(site.id, "Popular")

    for (const user of [one, two]) {
      const [folder] = await saveStateFor(site.id, user.id, listing.id, database)
      await setListingSaved(
        site.id,
        user.id,
        { collectionId: folder!.id, listingId: listing.id, saved: true },
        database
      )
    }

    expect((await mostSavedListings(site.id, database))[0]).toMatchObject({
      title: "Popular",
      saves: 2,
      people: 2,
    })
    expect(await saveImpactForListings(site.id, [listing.id], database)).toEqual({
      saves: 2,
    })
  })
})
