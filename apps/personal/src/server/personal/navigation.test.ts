import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import {
  PERSONAL_PROJECT_SECTION_ID,
  addPersonalNavigation,
} from "@/server/personal/navigation"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertWorkspace } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

const accountSection = { id: "section-account", title: "Account", entries: [] }

describe("left menu", () => {
  it("adds Project's My dashboard to each menu once and leaves a removed one removed", async () => {
    const workspace = await insertWorkspace(database, {
      settings: { sections: [accountSection] },
    })
    await addPersonalNavigation(database)
    await addPersonalNavigation(database)

    const [settings] = await database.select().from(customShellSettings)
    const members = (settings.settings as { memberSections: { id: string }[] })
      .memberSections
    expect(members.map((section) => section.id)).toEqual([
      PERSONAL_PROJECT_SECTION_ID,
      "section-member-home",
      "section-member-updates",
    ])

    const sectionsOf = async () => {
      const [row] = await database
        .select()
        .from(customShellWorkspaces)
        .where(eq(customShellWorkspaces.id, workspace.id))
      return (
        row.settings as {
          sections: { id: string; entries: { href?: string }[] }[]
        }
      ).sections
    }
    const sections = await sectionsOf()
    expect(sections.map((section) => section.id)).toEqual([
      PERSONAL_PROJECT_SECTION_ID,
      "section-account",
    ])
    expect(sections[0].entries.map((entry) => entry.href)).toEqual([
      "/apps/project/dashboard",
    ])

    // An admin removes the section; the next pass must not bring it back.
    await database
      .update(customShellWorkspaces)
      .set({ settings: { sections: [accountSection] } })
      .where(eq(customShellWorkspaces.id, workspace.id))
    await addPersonalNavigation(database)
    expect((await sectionsOf()).map((section) => section.id)).toEqual([
      "section-account",
    ])
  })

  it("leaves a workspace with no menu of its own alone", async () => {
    const workspace = await insertWorkspace(database)
    await addPersonalNavigation(database)
    const [row] = await database
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspace.id))
    expect(row.settings).toEqual({})
  })
})
