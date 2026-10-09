import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { listAdminProfiles, saveAdminProfile } from "@/server/pomodoro/admin-profiles"
import { pomodoroAuditLogs, pomodoroNoticeLinks, pomodoroProfiles } from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** An admin fixing a public profile, against a real database. */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function member(handle: string, profile: Partial<typeof pomodoroProfiles.$inferInsert> = {}) {
  const user = await insertUser(db, { name: handle })
  await db.insert(pomodoroProfiles).values({ userId: user.id, handle, publicDisplayName: handle, ...profile })
  return user.id
}

async function noticesFor(userId: string) {
  return db
    .select({ message: customShellNotifications.message, kind: pomodoroNoticeLinks.kind })
    .from(customShellNotifications)
    .innerJoin(pomodoroNoticeLinks, eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, userId))
}

describe("saving an admin's fix to a profile", () => {
  it("writes only what changed, logs it once and tells the owner which fields", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const owner = await member("sarah", { bio: "Hello" })

    const result = await saveAdminProfile({
      userId: owner,
      handle: "sarah-k",
      publicDisplayName: "sarah",
      bio: "Hello",
      actorUserId: admin,
    })

    expect(result.changed).toEqual(["address"])
    const [row] = await db.select().from(pomodoroProfiles).where(eq(pomodoroProfiles.userId, owner))
    expect(row.handle).toBe("sarah-k")
    expect(await db.select().from(pomodoroAuditLogs)).toMatchObject([
      { actorUserId: admin, action: "edit", resource: "pomodoro_profile", recordIds: [owner] },
    ])
    expect(await noticesFor(owner)).toEqual([
      { kind: "profile_edited", message: "The Pomoder team changed your public profile: address." },
    ])
  })

  it("writes nothing, logs nothing and tells nobody when nothing changed", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const owner = await member("sam")
    const result = await saveAdminProfile({ userId: owner, handle: "sam", publicDisplayName: "sam", bio: null, actorUserId: admin })
    expect(result.changed).toEqual([])
    expect(await db.select().from(pomodoroAuditLogs)).toHaveLength(0)
    expect(await noticesFor(owner)).toHaveLength(0)
  })

  it("refuses a handle somebody else holds, a reserved one and a badly shaped one", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const owner = await member("ann")
    await member("taken")
    const save = (handle: string) =>
      saveAdminProfile({ userId: owner, handle, publicDisplayName: "ann", bio: null, actorUserId: admin })
    await expect(save("taken")).rejects.toThrow("HANDLE_TAKEN")
    await expect(save("admin")).rejects.toThrow("RESERVED_HANDLE")
    await expect(save("A b")).rejects.toThrow("INVALID_HANDLE")
    expect(await db.select().from(pomodoroAuditLogs)).toHaveLength(0)
    expect(await noticesFor(owner)).toHaveLength(0)
  })
})

describe("the profiles list", () => {
  it("lists only profiles with a handle, and filters hidden ones", async () => {
    await member("shown", { profilePublic: true })
    await member("gone", { profilePublic: true, hiddenAt: new Date() })
    const noHandle = await insertUser(db)
    await db.insert(pomodoroProfiles).values({ userId: noHandle.id })

    const page = { search: "", sort: "handle" as const, direction: "asc" as const, page: 1, pageSize: 25 }
    const all = await listAdminProfiles({ ...page, visibility: "all" })
    expect(all.rows.map((row) => row.handle)).toEqual(["gone", "shown"])
    const hidden = await listAdminProfiles({ ...page, visibility: "hidden" })
    expect(hidden.rows.map((row) => row.handle)).toEqual(["gone"])
    const open = await listAdminProfiles({ ...page, visibility: "public" })
    expect(open.rows.map((row) => row.handle)).toEqual(["shown"])
  })
})
