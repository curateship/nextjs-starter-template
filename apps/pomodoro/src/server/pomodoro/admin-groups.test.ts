import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { deleteAdminGroups, listAdminGroups, loadAdminGroup } from "@/server/pomodoro/admin-groups"
import {
  pomodoroAuditLogs,
  pomodoroGroupMembers,
  pomodoroGroups,
  pomodoroNoticeLinks,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Focus groups in the admin (admin task 06, part 11), against a real database. */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function person(name: string) {
  return (await insertUser(db, { name })).id
}

async function group(name: string, ownerUserId: string, members: string[]) {
  const [row] = await db
    .insert(pomodoroGroups)
    .values({ name, ownerUserId, joinToken: crypto.randomUUID() })
    .returning({ id: pomodoroGroups.id })
  await db
    .insert(pomodoroGroupMembers)
    .values([ownerUserId, ...members].map((userId) => ({ groupId: row.id, userId })))
  return row.id
}

describe("focus groups", () => {
  it("lists groups with their owner and member count, and finds one member's groups", async () => {
    const [owner, ana, ben] = await Promise.all(["Owner", "Ana", "Ben"].map(person))
    const study = await group("Study", owner, [ana])
    await group("Gym", ben, [])

    const all = await listAdminGroups({ search: "", sort: "members", direction: "desc", page: 1, pageSize: 25 })
    expect(all.rows.map((row) => [row.name, row.ownerName, row.memberCount])).toEqual([
      ["Study", "Owner", 2],
      ["Gym", "Ben", 1],
    ])
    const anas = await listAdminGroups({ search: "", user: ana, sort: "created", direction: "desc", page: 1, pageSize: 25 })
    expect(anas.rows.map((row) => row.id)).toEqual([study])

    const window = await loadAdminGroup(study)
    expect(window.members.map((member) => member.name)).toEqual(["Owner", "Ana"])
  })

  it("deletes a group, tells everybody who was in it, and logs once", async () => {
    const actor = await person("Admin")
    const [owner, ana] = await Promise.all(["Owner", "Ana"].map(person))
    const study = await group("Study", owner, [ana])
    const missing = crypto.randomUUID()

    expect(await deleteAdminGroups({ ids: [study, missing], actorUserId: actor })).toEqual({
      deleted: [study],
      skipped: [missing],
    })
    expect(await db.select().from(pomodoroGroups)).toHaveLength(0)
    expect(await db.select().from(pomodoroGroupMembers)).toHaveLength(0)

    const notices = await db
      .select({
        to: customShellNotifications.recipientUserId,
        message: customShellNotifications.message,
        kind: pomodoroNoticeLinks.kind,
      })
      .from(customShellNotifications)
      .innerJoin(pomodoroNoticeLinks, eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id))
    expect(notices.map((notice) => notice.to).sort()).toEqual([owner, ana].sort())
    expect(notices[0]).toMatchObject({
      kind: "group_deleted",
      message: "The Pomoder team deleted the group Study.",
    })
    const logs = await db.select().from(pomodoroAuditLogs)
    expect(logs).toEqual([expect.objectContaining({ resource: "groups", recordIds: [study] })])
  })
})
