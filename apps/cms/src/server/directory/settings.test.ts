import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { directorySettings } from "@/server/directory/schema"
import {
  DIRECTORY_SETTING_DEFAULTS,
  directorySettingsFor,
  saveDirectoryBrowseSettings,
  saveDirectoryFrontPageSettings,
} from "@/server/directory/settings"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

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

  it("saves front-page choices without changing browse or claim choices", async () => {
    const saved = await saveDirectoryFrontPageSettings(
      workspaceId,
      { frontPageMode: "newest", frontPageCount: 6 },
      database
    )

    expect(saved).toMatchObject({
      claimsEnabled: true,
      browseTitle: "Directory",
      frontPageMode: "newest",
      frontPageCount: 6,
    })
  })
})
