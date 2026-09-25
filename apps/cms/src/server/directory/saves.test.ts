import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createListing, updateListing } from "@/server/directory/listings"
import {
  createSaveCollection,
  deleteSaveCollection,
  deleteSaveCollectionsAsAdmin,
  mostSavedListings,
  publicSavedProfile,
  removeSavedItemAsAdmin,
  renameSaveCollection,
  renameSaveCollectionAsAdmin,
  savedCollectionForWorkspace,
  savedCollectionPageForWorkspace,
  savedCollectionsForUser,
  saveImpactForListings,
  saveStateFor,
  setSaveCollectionPublic,
  setSaveCollectionPublicAsAdmin,
  setListingSaved,
} from "@/server/directory/saves"
import {
  directoryListings,
  directorySaveCollections,
} from "@/server/directory/schema"
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
  it("keeps new and existing lists private until their owner turns one on", async () => {
    const [owner, stranger] = await Promise.all([
      insertUser(database),
      insertUser(database),
    ])
    const site = await insertWorkspace(database, { name: "Alpha" })
    const listing = await published(site.id, "Alpha cafe")
    const [collection] = await saveStateFor(
      site.id,
      owner.id,
      listing.id,
      database
    )
    const visitorSite = {
      id: site.id,
      name: site.name,
      url: "https://alpha.test",
    }

    expect(collection?.saved).toBe(false)
    expect(
      (
        await database
          .select({ isPublic: directorySaveCollections.isPublic })
          .from(directorySaveCollections)
          .where(eq(directorySaveCollections.id, collection!.id))
      )[0]?.isPublic
    ).toBe(false)
    expect(await publicSavedProfile(visitorSite, owner.id, database)).toBeNull()
    expect(
      await publicSavedProfile(visitorSite, stranger.id, database)
    ).toBeNull()

    await expect(
      setSaveCollectionPublic(
        site.id,
        stranger.id,
        collection!.id,
        true,
        database
      )
    ).rejects.toThrow("That saved list no longer exists.")

    await setSaveCollectionPublic(
      site.id,
      owner.id,
      collection!.id,
      true,
      database
    )
    expect(
      await publicSavedProfile(visitorSite, owner.id, database)
    ).toMatchObject({
      collections: [{ id: collection!.id, name: "Saved" }],
    })

    await setSaveCollectionPublic(
      site.id,
      owner.id,
      collection!.id,
      false,
      database
    )
    expect(await publicSavedProfile(visitorSite, owner.id, database)).toBeNull()
  })

  it("shows only published listings from the visited site", async () => {
    const owner = await insertUser(database)
    const alpha = await insertWorkspace(database, { name: "Alpha" })
    const beta = await insertWorkspace(database, { name: "Beta" })
    const visible = await published(alpha.id, "Visible cafe")
    const unpublished = await published(alpha.id, "Draft cafe")
    const deleted = await published(alpha.id, "Deleted cafe")
    const betaListing = await published(beta.id, "Beta cafe")

    const [alphaList] = await saveStateFor(
      alpha.id,
      owner.id,
      visible.id,
      database
    )
    for (const listing of [visible, unpublished, deleted]) {
      await setListingSaved(
        alpha.id,
        owner.id,
        { collectionId: alphaList!.id, listingId: listing.id, saved: true },
        database
      )
    }
    const [betaList] = await saveStateFor(
      beta.id,
      owner.id,
      betaListing.id,
      database
    )
    await setListingSaved(
      beta.id,
      owner.id,
      { collectionId: betaList!.id, listingId: betaListing.id, saved: true },
      database
    )
    await Promise.all([
      setSaveCollectionPublic(
        alpha.id,
        owner.id,
        alphaList!.id,
        true,
        database
      ),
      setSaveCollectionPublic(beta.id, owner.id, betaList!.id, true, database),
      updateListing(alpha.id, unpublished.id, { status: "draft" }, database),
    ])
    await database
      .delete(directoryListings)
      .where(eq(directoryListings.id, deleted.id))

    const alphaProfile = await publicSavedProfile(
      { id: alpha.id, name: alpha.name, url: "https://alpha.test" },
      owner.id,
      database
    )
    expect(
      alphaProfile?.collections[0]?.listings.map((row) => row.title)
    ).toEqual(["Visible cafe"])

    const betaProfile = await publicSavedProfile(
      { id: beta.id, name: beta.name, url: "https://beta.test" },
      owner.id,
      database
    )
    expect(
      betaProfile?.collections[0]?.listings.map((row) => row.title)
    ).toEqual(["Beta cafe"])
  })

  it("lets owners and site admins fully manage saved lists", async () => {
    const [owner, stranger] = await Promise.all([
      insertUser(database),
      insertUser(database),
    ])
    const alpha = await insertWorkspace(database, { name: "Alpha" })
    const beta = await insertWorkspace(database, { name: "Beta" })
    const alphaListing = await published(alpha.id, "Alpha cafe")
    const betaListing = await published(beta.id, "Beta cafe")
    const [alphaList] = await saveStateFor(
      alpha.id,
      owner.id,
      alphaListing.id,
      database
    )
    const [betaList] = await saveStateFor(
      beta.id,
      owner.id,
      betaListing.id,
      database
    )
    await Promise.all([
      setListingSaved(
        alpha.id,
        owner.id,
        {
          collectionId: alphaList!.id,
          listingId: alphaListing.id,
          saved: true,
        },
        database
      ),
      setListingSaved(
        beta.id,
        owner.id,
        { collectionId: betaList!.id, listingId: betaListing.id, saved: true },
        database
      ),
    ])

    await expect(
      renameSaveCollection(
        alpha.id,
        stranger.id,
        alphaList!.id,
        "Not mine",
        database
      )
    ).rejects.toThrow("That saved list no longer exists.")
    await expect(
      renameSaveCollectionAsAdmin(
        alpha.id,
        betaList!.id,
        "Wrong site",
        database
      )
    ).rejects.toThrow("That saved list no longer exists.")

    await renameSaveCollection(
      alpha.id,
      owner.id,
      alphaList!.id,
      "  Weekend   picks  ",
      database
    )
    await setSaveCollectionPublicAsAdmin(
      alpha.id,
      alphaList!.id,
      true,
      database
    )
    let adminList = await savedCollectionForWorkspace(
      alpha.id,
      alphaList!.id,
      database
    )
    expect(adminList).toMatchObject({
      id: alphaList!.id,
      name: "Weekend picks",
      isPublic: true,
      ownerId: owner.id,
      items: [{ id: alphaListing.id }],
    })

    await removeSavedItemAsAdmin(
      alpha.id,
      alphaList!.id,
      alphaListing.id,
      database
    )
    adminList = await savedCollectionForWorkspace(
      alpha.id,
      alphaList!.id,
      database
    )
    expect(adminList?.items).toEqual([])

    const secondAlphaState = await createSaveCollection(
      alpha.id,
      owner.id,
      { listingId: alphaListing.id, name: "Second list" },
      database
    )
    const secondAlphaList = secondAlphaState.find(
      (collection) => collection.name === "Second list"
    )!
    const firstPage = await savedCollectionPageForWorkspace(
      alpha.id,
      { sort: "name", limit: 1 },
      database
    )
    expect(firstPage).toMatchObject({
      total: 2,
      collections: [{ id: secondAlphaList.id, itemCount: 1 }],
    })
    const searchedPage = await savedCollectionPageForWorkspace(
      alpha.id,
      { search: "weekend", offset: 0, limit: 1 },
      database
    )
    expect(searchedPage).toMatchObject({
      total: 1,
      collections: [{ id: alphaList!.id, itemCount: 0 }],
    })
    const deleted = await deleteSaveCollectionsAsAdmin(
      alpha.id,
      [alphaList!.id, secondAlphaList.id, betaList!.id],
      database
    )
    expect(deleted.deleted.sort()).toEqual(
      [alphaList!.id, secondAlphaList.id].sort()
    )
    expect(
      await savedCollectionPageForWorkspace(alpha.id, {}, database)
    ).toEqual({ collections: [], total: 0 })
    await deleteSaveCollection(beta.id, owner.id, betaList!.id, database)
    expect(
      (await savedCollectionsForUser(owner.id, database)).find(
        (collection) => collection.id === betaList!.id
      )
    ).toBeUndefined()
  })

  it("keeps the same account's folders separate by site", async () => {
    const user = await insertUser(database)
    const alpha = await insertWorkspace(database, { name: "Alpha" })
    const beta = await insertWorkspace(database, { name: "Beta" })
    const alphaListing = await published(alpha.id, "Alpha cafe")
    const betaListing = await published(beta.id, "Beta cafe")

    const alphaState = await saveStateFor(
      alpha.id,
      user.id,
      alphaListing.id,
      database
    )
    await setListingSaved(
      alpha.id,
      user.id,
      {
        collectionId: alphaState[0]!.id,
        listingId: alphaListing.id,
        saved: true,
      },
      database
    )

    expect(
      (await saveStateFor(beta.id, user.id, betaListing.id, database))[0]?.saved
    ).toBe(false)
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
    const [one, two] = await Promise.all([
      insertUser(database),
      insertUser(database),
    ])
    const site = await insertWorkspace(database)
    const listing = await published(site.id, "Popular")

    for (const user of [one, two]) {
      const [folder] = await saveStateFor(
        site.id,
        user.id,
        listing.id,
        database
      )
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
    expect(
      await saveImpactForListings(site.id, [listing.id], database)
    ).toEqual({
      saves: 2,
    })
  })
})
