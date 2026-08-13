import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { copyUserWorkspace, parseWorkspaceSettings } from "@/server/people/workspaces"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import {
  customShellAnnouncements,
  customShellAutomations,
  customShellBroadcasts,
  customShellContacts,
  customShellContactSegments,
  customShellMedia,
  customShellPlans,
  customShellTrafficDailyTotals,
  customShellUsers,
  customShellWorkspaces,
  customShellWrittenPages,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

describe("starting a workspace from an existing one", () => {
  it("copies only settings and written pages, with new ids, as a draft", async () => {
    const at = now()
    const owner = await insertUser(database, { role: "admin" })
    const source = await insertWorkspace(database, {
      userId: owner.id,
      name: "Alpha",
      settings: {
        favicon: "https://example.test/alpha.png",
        accentColor: "#123456",
        publicFooterCopyright: "Alpha Ltd",
        pages: { "/about": { visibility: "off" } },
      },
    })
    const sourcePageId = uuid()
    await database.insert(customShellWrittenPages).values({
      id: sourcePageId,
      workspaceId: source.id,
      path: "/about",
      title: "About Alpha",
      body: { type: "doc", content: [] },
      createdAt: at,
      updatedAt: at,
    })

    await seedContentThatMustNotCopy(source.id, owner.id, at)
    const usersBefore = await database.select().from(customShellUsers)
    const plansBefore = await database.select().from(customShellPlans)

    const copied = await copyUserWorkspace(
      owner.id,
      source.id,
      "Gamma",
      {},
      database,
      { subdomain: "gamma", customDomain: "gamma.test", status: "active" }
    )

    expect(copied).toMatchObject({
      name: "Gamma",
      subdomain: "gamma",
      customDomain: "gamma.test",
      status: "draft",
    })
    expect(parseWorkspaceSettings(copied.settings)).toMatchObject({
      favicon: "https://example.test/alpha.png",
      publicFooterCopyright: "Alpha Ltd",
      pages: { "/about": { visibility: "off" } },
    })

    const sourceAfter = await database
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, source.id))
    expect(sourceAfter).toEqual([source])

    const copiedPages = await database
      .select()
      .from(customShellWrittenPages)
      .where(eq(customShellWrittenPages.workspaceId, copied.id))
    expect(copiedPages).toHaveLength(1)
    expect(copiedPages[0]).toMatchObject({
      workspaceId: copied.id,
      path: "/about",
      title: "About Alpha",
    })
    expect(copiedPages[0]?.id).not.toBe(sourcePageId)

    for (const table of [
      customShellAnnouncements,
      customShellAutomations,
      customShellBroadcasts,
      customShellContacts,
      customShellContactSegments,
      customShellMedia,
      customShellTrafficDailyTotals,
    ]) {
      await expect(
        database.select().from(table).where(eq(table.workspaceId, copied.id))
      ).resolves.toEqual([])
    }
    const usersAfter = await database.select().from(customShellUsers)
    expect(usersAfter.map((user) => user.id)).toEqual(
      usersBefore.map((user) => user.id)
    )
    await expect(database.select().from(customShellPlans)).resolves.toEqual(
      plansBefore
    )
  })

  it("rolls everything back when an app copy choice fails", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const source = await insertWorkspace(database, { userId: owner.id })
    const at = now()
    const sourcePage = {
      id: uuid(),
      workspaceId: source.id,
      path: "/rollback",
      title: "Rollback",
      body: { type: "doc", content: [] },
      createdAt: at,
      updatedAt: at,
    }
    await database.insert(customShellWrittenPages).values(sourcePage)

    await expect(
      copyUserWorkspace(
        owner.id,
        source.id,
        "Never exists",
        {},
        database,
        undefined,
        { choices: ["not-configured"] }
      )
    ).rejects.toThrow("not available")

    await expect(database.select().from(customShellWorkspaces)).resolves.toEqual([
      source,
    ])
    await expect(database.select().from(customShellWrittenPages)).resolves.toEqual([
      sourcePage,
    ])
  })

  it("refuses a source the caller cannot reach", async () => {
    const owner = await insertUser(database)
    const stranger = await insertUser(database)
    const source = await insertWorkspace(database, { userId: stranger.id })

    await expect(
      copyUserWorkspace(owner.id, source.id, "Stolen", {}, database)
    ).rejects.toThrow("Workspace not found")
  })
})

async function seedContentThatMustNotCopy(
  workspaceId: string,
  userId: string,
  at: Date
) {
  await database.insert(customShellAnnouncements).values({
    id: uuid(),
    workspaceId,
    title: "Private notice",
    body: "Source only",
    startsAt: at,
    createdAt: at,
    updatedAt: at,
  })
  await database.insert(customShellAutomations).values({
    id: uuid(),
    workspaceId,
    userId,
    name: "Source flow",
    graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    createdAt: at,
    updatedAt: at,
  })
  await database.insert(customShellBroadcasts).values({
    id: uuid(),
    workspaceId,
    name: "Source email",
    createdAt: at,
    updatedAt: at,
  })
  await database.insert(customShellContacts).values({
    id: uuid(),
    workspaceId,
    email: "source-only@example.test",
    createdAt: at,
    updatedAt: at,
  })
  await database.insert(customShellContactSegments).values({
    id: uuid(),
    workspaceId,
    name: "Source segment",
    createdAt: at,
    updatedAt: at,
  })
  await database.insert(customShellMedia).values({
    id: uuid(),
    workspaceId,
    userId,
    filename: "source.png",
    originalName: "source.png",
    fileSize: 10,
    mimeType: "image/png",
    fileType: "image",
    storagePath: `source/${uuid()}.png`,
    createdAt: at,
    updatedAt: at,
  })
  await database.insert(customShellTrafficDailyTotals).values({
    workspaceId,
    day: "2026-08-13",
    views: 4,
  })
  await database.insert(customShellPlans).values({
    id: uuid(),
    slug: `source-${uuid()}`,
    name: "Source plan",
    createdAt: at,
    updatedAt: at,
  })
}
