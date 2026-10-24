import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { PERSONAL_PROJECT_ID } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { loadAdminDashboard } from "@/server/project/admin-dashboard"
import { loadMyTaskOrder, orderMyTasks } from "@/server/project/my-task-order"
import { addProjectMember, createProject } from "@/server/project/projects"
import { createTask } from "@/server/project/tasks"
import { insertSiteAdmin, startTeam } from "@/server/project/test-people"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * My dashboard's List in my own order (workspace/tasks/Misc/drag-tasks-on-my-dashboard.md).
 * Tyler, 23 Oct 2026: "I want to be able to drag and drop tasks into
 * different order and sections". The order is each person's own.
 */
let client: PGlite
let database: CustomShellDb
let tyler: CustomShellUser
let ben: CustomShellUser
let acme: string
let website: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name, currentWorkspaceId: user.currentWorkspaceId })

/** A task the site admin makes and gives to `assignee`; his own list is on no team. */
async function newTask(title: string, assignee: CustomShellUser, projectId = website) {
  const make = () =>
    createTask(actor(tyler), { projectId, title, notes: "", assigneeUserId: assignee.id, dueDate: null, steps: [] }, database)
  return (await (projectId === PERSONAL_PROJECT_ID ? make() : inTeam(acme, make))).id
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  tyler = await insertSiteAdmin(database)
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  acme = (await startTeam(database, [ben], { name: "Acme", admin: tyler })).team.id
  website = (await inTeam(acme, () => createProject(tyler.id, { name: "Website", color: "blue", description: "" }, database))).id
  await addProjectMember(tyler.id, website, ben.id, database)
})

afterEach(async () => {
  await client.close()
})

describe("my order", () => {
  it("keeps one heading's rows in the order I set, mine alone", async () => {
    const first = await newTask("First", ben)
    const second = await newTask("Second", ben)
    await orderMyTasks(ben.id, "today", [second, first], database)
    expect(await loadMyTaskOrder(ben.id, database)).toEqual([
      { taskId: second, heading: "today", position: 0 },
      { taskId: first, heading: "today", position: 1 },
    ])
    expect(await loadMyTaskOrder(tyler.id, database)).toEqual([])
  })

  it("moves a task's place to its new heading and drops the old heading's leftovers", async () => {
    const first = await newTask("First", ben)
    const second = await newTask("Second", ben)
    const third = await newTask("Third", ben)
    await orderMyTasks(ben.id, "none", [first, second, third], database)
    // First is dropped under Today; No date is then saved without it.
    await orderMyTasks(ben.id, "today", [first], database)
    await orderMyTasks(ben.id, "none", [third, second], database)
    expect(await loadMyTaskOrder(ben.id, database)).toEqual([
      { taskId: first, heading: "today", position: 0 },
      { taskId: third, heading: "none", position: 0 },
      { taskId: second, heading: "none", position: 1 },
    ])
    // Saving Today again without First forgets First's place there.
    const fourth = await newTask("Fourth", ben)
    await orderMyTasks(ben.id, "today", [fourth], database)
    expect((await loadMyTaskOrder(ben.id, database)).map((place) => place.taskId)).not.toContain(first)
  })

  it("refuses a task that isn't assigned to me, and a task named twice", async () => {
    const mine = await newTask("Mine", ben)
    const theirs = await newTask("Theirs", tyler)
    await expect(orderMyTasks(ben.id, "today", [mine, theirs], database)).rejects.toThrow(PROJECT_ERRORS.notMyTasks)
    await expect(orderMyTasks(ben.id, "today", [mine, mine], database)).rejects.toThrow(PROJECT_ERRORS.notMyTasks)
    expect(await loadMyTaskOrder(ben.id, database)).toEqual([])
  })

  it("comes with the site admin's My dashboard", async () => {
    const own = await newTask("Send the contract", tyler, PERSONAL_PROJECT_ID)
    await orderMyTasks(tyler.id, "none", [own], database)
    expect((await loadAdminDashboard(tyler.id, database)).myOrder).toEqual([{ taskId: own, heading: "none", position: 0 }])
  })
})
