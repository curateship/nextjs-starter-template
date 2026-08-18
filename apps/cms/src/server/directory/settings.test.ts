import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { categories, directorySettings } from "@/server/directory/schema"
import {
  DIRECTORY_SETTING_DEFAULTS,
  directoryGeocodingKeyStatus,
  directorySettingsFor,
  saveDirectoryGeocodingKey,
  saveDirectoryBrowseCategories,
  saveDirectoryBrowseSettings,
} from "@/server/directory/settings"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import { uuid } from "@/server/auth/security"

let client: PGlite
let database: TestDatabase
let workspaceId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  workspaceId = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

describe("directory settings", () => {
  it("stores the geocoding key encrypted and returns only its masked tail", async () => {
    const previous = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "directory-test-secret"
    try {
      expect(
        await saveDirectoryGeocodingKey(
          workspaceId,
          "google-key-1234",
          database
        )
      ).toBe("••••1234")
      const [row] = await database.select().from(directorySettings)
      expect(row?.geocodingApiKeyEncrypted).not.toContain("google-key-1234")
    } finally {
      if (previous === undefined) {
        delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
      } else {
        process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = previous
      }
    }
  })

  it("keeps settings usable when a stored key cannot be decrypted", async () => {
    const at = new Date()
    await database.insert(directorySettings).values({
      workspaceId,
      geocodingApiKeyEncrypted: "not-encrypted-data",
      createdAt: at,
      updatedAt: at,
    })

    await expect(
      directoryGeocodingKeyStatus(workspaceId, database)
    ).resolves.toBeNull()
  })

  it("returns today's behavior when a site has never saved settings", async () => {
    expect(await directorySettingsFor(workspaceId, database)).toEqual(
      DIRECTORY_SETTING_DEFAULTS
    )
  })

  it("saves browse choices without changing claim or badge choices", async () => {
    const at = new Date()
    await database.insert(directorySettings).values({
      workspaceId,
      claimsEnabled: false,
      badgesEnabled: true,
      createdAt: at,
      updatedAt: at,
    })

    const saved = await saveDirectoryBrowseSettings(
      workspaceId,
      {
        pageSize: 24,
        defaultSort: "newest",
        browseTitle: "Places to eat",
        browseIntro: "Independent places across Toronto.",
        featuredFirst: false,
      },
      database
    )

    expect(saved).toMatchObject({
      claimsEnabled: false,
      badgesEnabled: true,
      pageSize: 24,
      defaultSort: "newest",
      browseTitle: "Places to eat",
      browseIntro: "Independent places across Toronto.",
      featuredFirst: false,
    })
  })

  it("refuses an invalid page size without writing it", async () => {
    await expect(
      saveDirectoryBrowseSettings(
        workspaceId,
        {
          pageSize: 49,
          defaultSort: "order",
          browseTitle: "Directory",
          browseIntro: "",
          featuredFirst: true,
        },
        database
      )
    ).rejects.toThrow("Listings per page must be between 6 and 48.")

    expect(await directorySettingsFor(workspaceId, database)).toEqual(
      DIRECTORY_SETTING_DEFAULTS
    )
  })

  it("falls back safely when an old saved sort is no longer available", async () => {
    const at = new Date()
    await database.insert(directorySettings).values({
      workspaceId,
      defaultSort: "retired-sort",
      createdAt: at,
      updatedAt: at,
    })

    expect(
      (await directorySettingsFor(workspaceId, database)).defaultSort
    ).toBe(DIRECTORY_SETTING_DEFAULTS.defaultSort)
  })

  it("starts with no category cards on the browse page", async () => {
    const settings = await directorySettingsFor(workspaceId, database)
    expect(settings).toMatchObject({
      browseCategoriesEnabled: false,
      browseCategorySource: "top-level",
      browsePickedCategoryIds: [],
    })
  })

  it("saves the browse-page category row without touching anything else", async () => {
    const saved = await saveDirectoryBrowseCategories(
      workspaceId,
      {
        browseCategoriesEnabled: true,
        browseCategorySource: "top-level",
        browsePickedCategoryIds: [],
      },
      database
    )

    expect(saved).toMatchObject({
      browseCategoriesEnabled: true,
      browseCategorySource: "top-level",
      // Untouched by this save.
      claimsEnabled: true,
      browseTitle: "Directory",
      mapEnabled: false,
    })
  })

  it("refuses a hand-picked row with nothing picked", async () => {
    await expect(
      saveDirectoryBrowseCategories(
        workspaceId,
        {
          browseCategoriesEnabled: true,
          browseCategorySource: "picked",
          browsePickedCategoryIds: [],
        },
        database
      )
    ).rejects.toThrow(/at least one category/)
  })

  it("refuses a category that belongs to another site", async () => {
    const otherSite = await insertWorkspace(database)
    const theirs = uuid()
    const at = new Date()
    await database.insert(categories).values({
      id: theirs,
      workspaceId: otherSite.id,
      name: "Theirs",
      slug: "theirs",
      createdAt: at,
      updatedAt: at,
    })

    await expect(
      saveDirectoryBrowseCategories(
        workspaceId,
        {
          browseCategoriesEnabled: true,
          browseCategorySource: "picked",
          browsePickedCategoryIds: [theirs],
        },
        database
      )
    ).rejects.toThrow("That category is not on this site.")
  })

  it("forgets a stale pick when the row is switched off", async () => {
    const mine = uuid()
    const at = new Date()
    await database.insert(categories).values({
      id: mine,
      workspaceId,
      name: "Mine",
      slug: "mine",
      createdAt: at,
      updatedAt: at,
    })
    await saveDirectoryBrowseCategories(
      workspaceId,
      {
        browseCategoriesEnabled: true,
        browseCategorySource: "picked",
        browsePickedCategoryIds: [mine],
      },
      database
    )

    // Switched off, the list goes with it — there is no stale set of ids sitting
    // behind a switch that stopped using them.
    const off = await saveDirectoryBrowseCategories(
      workspaceId,
      {
        browseCategoriesEnabled: false,
        browseCategorySource: "picked",
        browsePickedCategoryIds: [mine],
      },
      database
    )
    expect(off.browsePickedCategoryIds).toEqual([])
  })
})
