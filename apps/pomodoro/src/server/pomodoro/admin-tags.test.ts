import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { deleteAdminTags, listAdminTags } from "@/server/pomodoro/admin-tags"
import { pomodoroAuditLogs, pomodoroTags, pomodoroTaskTags, tasks } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Member task tags in the admin (admin task 06, part 4): the count of tasks
 * using each, and a delete that takes the label off those tasks and nothing
 * else.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

const LIST = { search: "", sort: "tasks" as const, direction: "desc" as const, page: 1, pageSize: 25 }

async function tagged(userId: string, name: string, taskCount: number) {
  const [tag] = await db.insert(pomodoroTags).values({ userId, name }).returning()
  for (let index = 0; index < taskCount; index += 1) {
    const [task] = await db
      .insert(tasks)
      .values({ userId, title: `${name} ${index}`, plannedDate: "2026-10-08" })
      .returning()
    await db.insert(pomodoroTaskTags).values({ taskId: task.id, tagId: tag.id })
  }
  return tag.id
}

describe("the tags list", () => {
  it("counts the tasks using each tag, most used first, and filters to one owner", async () => {
    const ada = await insertUser(db, { name: "Ada" })
    const bo = await insertUser(db, { name: "Bo" })
    await tagged(ada.id, "email", 3)
    await tagged(ada.id, "admin", 0)
    await tagged(bo.id, "calls", 1)

    const { rows, total } = await listAdminTags(LIST)
    expect(total).toBe(3)
    expect(rows.map((row) => [row.name, row.taskCount])).toEqual([
      ["email", 3],
      ["calls", 1],
      ["admin", 0],
    ])
    expect((await listAdminTags({ ...LIST, user: bo.id })).rows.map((row) => row.name)).toEqual(["calls"])
    expect((await listAdminTags({ ...LIST, search: "Bo" })).total).toBe(1)
  })
})

describe("deleting tags", () => {
  it("takes the label off the tasks, keeps the tasks, and logs once", async () => {
    const admin = await insertUser(db, { role: "admin" })
    const ada = await insertUser(db)
    const email = await tagged(ada.id, "email", 2)
    const gone = crypto.randomUUID()

    const result = await deleteAdminTags({ tagIds: [email, gone], actorUserId: admin.id })
    expect(result).toEqual({ deleted: [email], skipped: [gone] })
    expect(await db.select().from(pomodoroTaskTags)).toHaveLength(0)
    expect(await db.select().from(tasks)).toHaveLength(2)
    expect(await db.select().from(pomodoroAuditLogs)).toEqual([
      expect.objectContaining({ action: "delete", resource: "task_tags", recordIds: [email] }),
    ])
  })
})
