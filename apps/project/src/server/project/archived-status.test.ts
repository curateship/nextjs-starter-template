import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { isOverdue } from "@/lib/project/dates"
import { boardStatusOrder } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { addProjectMember } from "@/server/project/projects"
import { projectTasks } from "@/server/project/schema"
import { createTask, loadMyWork, setTaskStatus } from "@/server/project/tasks"
import { insertEmployee, projectFor, startTeam } from "@/server/project/test-people"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase } from "@/server/test-support"

/*
 * The fifth status, Archived (Tyler, 25 Oct 2026). It keeps its Board column
 * on a project and is out of everything that counts open work.
 */
let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let projectId: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertEmployee(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertEmployee(database, { name: "Ben", email: "ben@example.test" })
  const { admin } = await startTeam(database, [anna, ben])
  const project = await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)
  projectId = project.id
  await addProjectMember(admin.id, projectId, ben.id, database)
})

afterEach(async () => {
  await client.close()
})

describe("Archived", () => {
  it("saves, and leaves the person's own tasks", async () => {
    const made = await createTask(
      actor(anna),
      { projectId, title: "Old banner", notes: "", assigneeUserId: ben.id, dueDate: "2000-01-03", steps: [] },
      database
    )
    expect((await loadMyWork(ben.id, database)).map((task) => task.id)).toContain(made.id)

    await setTaskStatus(actor(ben), { taskId: made.id, status: "archived", stuckReason: null }, database)

    const [row] = await database.select().from(projectTasks).where(eq(projectTasks.id, made.id))
    expect(row.status).toBe("archived")
    expect(row.completedAt).toBeNull()
    expect((await loadMyWork(ben.id, database)).map((task) => task.id)).not.toContain(made.id)
  })

  it("is never late", () => {
    expect(isOverdue("2000-01-03", "archived")).toBe(false)
    expect(isOverdue("2000-01-03", "todo")).toBe(true)
  })

  it("joins a Board order saved before it existed, at the end", () => {
    expect(boardStatusOrder(["stuck", "done", "doing", "todo"])).toEqual([
      "stuck",
      "done",
      "doing",
      "todo",
      "archived",
    ])
  })
})
