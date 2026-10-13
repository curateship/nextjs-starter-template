import { PGlite } from "@electric-sql/pglite"
import { eq, inArray } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { checkOut, finishedNote, loadCheckinPage, submitCheckin } from "@/server/project/checkins"
import { inviteAddresses } from "@/lib/project/rules"
import { acceptInvite, createInvite, createInvites } from "@/server/project/invites"
import { addProjectMember, createProject } from "@/server/project/projects"
import { projectTasks, projectTeamInvites } from "@/server/project/schema"
import { changeManyTasks, duplicateTask } from "@/server/project/task-changes"
import { createTask, deleteTask, listTaskCards, loadTaskDetail, updateTask } from "@/server/project/tasks"
import { createTeam } from "@/server/project/teams"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * Features 13 Oct 2026. Dates are in 2099 so nothing here meets the real
 * today. 2 March 2099 is a Monday. The team works Monday to Friday at 9:00 UTC.
 */
const MONDAY = "2099-03-02"
const TUESDAY = "2099-03-03"
const at = (iso: string) => new Date(iso)

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

const actor = (user: CustomShellUser) => ({
  id: user.id,
  name: user.name,
  currentWorkspaceId: user.currentWorkspaceId,
})

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
  const sent = await createInvite(actor(anna), { email: ben.email, role: "member" }, database)
  await acceptInvite(ben, sent.inviteId, database)
})

afterEach(async () => {
  await client.close()
})

/** Anna's project with Ben in it, and one task each for Ben. */
async function benWithTasks(titles: string[]) {
  const project = await createProject(anna.id, { name: "Website", color: "blue", description: "" }, database)
  await addProjectMember(anna.id, project.id, ben.id, database)
  const ids: string[] = []
  for (const title of titles) {
    const task = await createTask(
      actor(ben),
      { projectId: project.id, title, notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] },
      database
    )
    ids.push(task.id)
  }
  return { projectId: project.id, ids }
}

/** Marks tasks Done at a set moment, since the app stamps Done with the real clock. */
async function doneAt(ids: string[], iso: string) {
  await database
    .update(projectTasks)
    .set({ status: "done", completedAt: at(iso) })
    .where(inArray(projectTasks.id, ids))
}

describe("Yesterday fills itself", () => {
  it("lists the tasks finished since the last check-in when there was no check-out", async () => {
    const { ids } = await benWithTasks(["Send the invoice", "Fix the login page", "Book the venue"])
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    await doneAt([ids[0]], `${MONDAY}T08:00:00Z`)
    await doneAt([ids[1]], `${MONDAY}T11:00:00Z`)
    await doneAt([ids[2]], `${MONDAY}T15:00:00Z`)

    const page = await loadCheckinPage(ben.id, database, at(`${TUESDAY}T08:30:00Z`))
    expect(page.notes.yesterday).toBe("Fix the login page\nBook the venue")
  })

  it("keeps the check-out note when there is one", async () => {
    const { ids } = await benWithTasks(["Logo"])
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    await checkOut(actor(ben), { doneTaskIds: [], noteLeft: "Contact form half done" }, database, at(`${MONDAY}T17:00:00Z`))
    await doneAt(ids, `${MONDAY}T12:00:00Z`)

    const page = await loadCheckinPage(ben.id, database, at(`${TUESDAY}T08:30:00Z`))
    expect(page.notes.yesterday).toBe("Contact form half done")
  })

  it("leaves out tasks moved back out of Done, binned, or someone else's", async () => {
    const { projectId, ids } = await benWithTasks(["Reopened", "Binned", "Kept"])
    const annas = await createTask(
      actor(anna),
      { projectId, title: "Anna's", notes: "", assigneeUserId: anna.id, dueDate: null, steps: [] },
      database
    )
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    await doneAt([...ids, annas.id], `${MONDAY}T12:00:00Z`)
    await database
      .update(projectTasks)
      .set({ status: "doing", completedAt: null })
      .where(eq(projectTasks.id, ids[0]))
    await deleteTask(actor(ben), ids[1], database)

    const page = await loadCheckinPage(ben.id, database, at(`${TUESDAY}T08:30:00Z`))
    expect(page.notes.yesterday).toBe("Kept")
  })

  it("starts empty on a first check-in and after a day with nothing finished", async () => {
    const { ids } = await benWithTasks(["Logo"])
    await doneAt(ids, `${MONDAY}T07:00:00Z`)
    expect((await loadCheckinPage(ben.id, database, at(`${MONDAY}T08:30:00Z`))).notes.yesterday).toBeNull()

    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    expect((await loadCheckinPage(ben.id, database, at(`${TUESDAY}T08:30:00Z`))).notes.yesterday).toBeNull()
  })

  it("names ten tasks and counts the rest", () => {
    const titles = Array.from({ length: 25 }, (_, i) => `Task ${i + 1}`)
    const note = finishedNote(titles)!.split("\n")
    expect(note).toHaveLength(11)
    expect(note[9]).toBe("Task 10")
    expect(note[10]).toBe("and 15 more")
    expect(finishedNote([])).toBeNull()
  })

  it("stops naming tasks before the note passes 280 characters", () => {
    const long = Array.from({ length: 5 }, (_, i) => `${i + 1} ${"x".repeat(100)}`)
    const note = finishedNote(long)!
    expect(note.length).toBeLessThanOrEqual(280)
    expect(note.split("\n")).toEqual([long[0], long[1], "and 3 more"])
  })
})

describe("Suggested picks at check-in", () => {
  async function due(taskId: string, dueDate: string | null, fields: Partial<typeof projectTasks.$inferInsert> = {}) {
    await database.update(projectTasks).set({ dueDate, ...fields }).where(eq(projectTasks.id, taskId))
  }

  it("orders overdue, due today, Doing, then High, and lists none twice", async () => {
    const { ids } = await benWithTasks(["High", "Doing", "Today", "Late", "Plain"])
    const [high, doing, today, late] = ids
    await due(high, null, { priority: "high" })
    await due(doing, null, { status: "doing" })
    await due(today, MONDAY)
    await due(late, "2099-02-27")

    const page = await loadCheckinPage(ben.id, database, at(`${MONDAY}T08:30:00Z`))
    expect(page.suggested.map((task) => task.title)).toEqual(["Late", "Today", "Doing", "High"])
    expect(page.groups.flatMap((group) => group.tasks).map((task) => task.title)).toEqual(["Plain"])
    // Suggested, not ticked.
    expect(page.planned).toEqual([])
  })

  it("never suggests a Stuck task, a task waiting to be accepted, or more than five", async () => {
    const { projectId, ids } = await benWithTasks(["Stuck", "1", "2", "3", "4", "5", "6"])
    await due(ids[0], "2099-02-20", { status: "stuck", stuckReason: "No logo" })
    for (const id of ids.slice(1)) await due(id, MONDAY)
    await createTask(
      actor(anna),
      { projectId, title: "Handed", notes: "", assigneeUserId: ben.id, dueDate: "2099-02-20", steps: [] },
      database
    )

    const page = await loadCheckinPage(ben.id, database, at(`${MONDAY}T08:30:00Z`))
    const titles = page.suggested.map((task) => task.title)
    expect(titles).toHaveLength(5)
    expect(titles).not.toContain("Stuck")
    expect(titles).not.toContain("Handed")
  })

  it("leaves the check-out's plan where it was and suggests nothing once checked in", async () => {
    const { ids } = await benWithTasks(["Planned", "Late"])
    await due(ids[0], "2099-02-20")
    await due(ids[1], "2099-02-20")
    await submitCheckin(ben.id, { answers: [], picks: [] }, database, at(`${MONDAY}T09:00:00Z`))
    expect((await loadCheckinPage(ben.id, database, at(`${MONDAY}T10:00:00Z`))).suggested).toEqual([])
    await checkOut(
      actor(ben),
      { doneTaskIds: [], noteLeft: null, tomorrowTaskIds: [ids[0]] },
      database,
      at(`${MONDAY}T17:00:00Z`)
    )

    const page = await loadCheckinPage(ben.id, database, at(`${TUESDAY}T08:30:00Z`))
    expect(page.suggested.map((task) => task.title)).toEqual(["Late"])
    expect(page.planned).toEqual([ids[0]])
  })
})

describe("Invite several people at once", () => {
  it("sends each new address and lists the rest without sending them", async () => {
    await createInvite(actor(anna), { email: "dee@example.test", role: "member" }, database)
    const outcomes = await createInvites(
      actor(anna),
      {
        emails: ["ED@example.test", "fay@example.test", "ben@example.test", "dee@example.test", "nope", "ed@example.test"],
        role: "member",
      },
      database
    )
    expect(outcomes.map(({ email, result }) => [email, result])).toEqual([
      ["ed@example.test", "sent"],
      ["fay@example.test", "sent"],
      ["ben@example.test", "on_team"],
      ["dee@example.test", "invited"],
      ["nope", "not_an_email"],
    ])
    const invites = await database.select().from(projectTeamInvites)
    expect(invites.map((invite) => invite.email).sort()).toEqual([
      "dee@example.test",
      "ed@example.test",
      "fay@example.test",
    ])
  })

  it("marks the addresses past the hourly cap and still sends the ones before it", async () => {
    const emails = Array.from({ length: 20 }, (_, i) => `p${i}@example.test`)
    // Ben's invite at the start already used one of Anna's 30 an hour.
    const first = await createInvites(actor(anna), { emails, role: "member" }, database)
    expect(first.every((outcome) => outcome.result === "sent")).toBe(true)
    const more = Array.from({ length: 10 }, (_, i) => `q${i}@example.test`)
    const second = await createInvites(actor(anna), { emails: more, role: "member" }, database)
    expect(second.filter((outcome) => outcome.result === "sent")).toHaveLength(9)
    expect(second.at(-1)?.result).toBe("too_many")
  })

  it("is only for the owner and admins", async () => {
    await expect(
      createInvites(actor(ben), { emails: ["gus@example.test"], role: "member" }, database)
    ).rejects.toThrow()
  })

  it("splits pasted text into addresses", () => {
    expect(inviteAddresses("Ann@x.com, bob@x.com;\ncid@x.com  <dee@x.com>\nann@x.com")).toEqual([
      "ann@x.com",
      "bob@x.com",
      "cid@x.com",
      "dee@x.com",
    ])
    expect(inviteAddresses("  \n ")).toEqual([])
  })
})

describe("Due at a time of day", () => {
  const BY_3PM = "2099-03-02T15:00:00.000Z"
  async function dueAtOf(taskId: string) {
    const [row] = await database
      .select({ dueDate: projectTasks.dueDate, dueAt: projectTasks.dueAt })
      .from(projectTasks)
      .where(eq(projectTasks.id, taskId))
    return { dueDate: row.dueDate, dueAt: row.dueAt?.toISOString() ?? null }
  }

  it("saves a time on the due date, and a new date without one clears it", async () => {
    const { ids } = await benWithTasks(["Deck"])
    await updateTask(actor(ben), { taskId: ids[0], dueDate: MONDAY }, database)
    await updateTask(actor(ben), { taskId: ids[0], dueAt: BY_3PM }, database)
    expect(await dueAtOf(ids[0])).toEqual({ dueDate: MONDAY, dueAt: BY_3PM })
    expect((await loadTaskDetail(ben.id, ids[0], database)).task.dueAt).toBe(BY_3PM)

    await updateTask(actor(ben), { taskId: ids[0], title: "Deck v2" }, database)
    expect((await dueAtOf(ids[0])).dueAt).toBe(BY_3PM)
    await updateTask(actor(ben), { taskId: ids[0], dueDate: TUESDAY }, database)
    expect(await dueAtOf(ids[0])).toEqual({ dueDate: TUESDAY, dueAt: null })
  })

  it("clears the time with the date, and on its own", async () => {
    const { ids } = await benWithTasks(["Deck"])
    await updateTask(actor(ben), { taskId: ids[0], dueDate: MONDAY, dueAt: BY_3PM }, database)
    await updateTask(actor(ben), { taskId: ids[0], dueAt: null }, database)
    expect(await dueAtOf(ids[0])).toEqual({ dueDate: MONDAY, dueAt: null })
    await updateTask(actor(ben), { taskId: ids[0], dueDate: MONDAY, dueAt: BY_3PM }, database)
    await updateTask(actor(ben), { taskId: ids[0], dueDate: null }, database)
    expect(await dueAtOf(ids[0])).toEqual({ dueDate: null, dueAt: null })
  })

  it("refuses a time with no due date, or far from it", async () => {
    const { ids } = await benWithTasks(["Deck"])
    await expect(updateTask(actor(ben), { taskId: ids[0], dueAt: BY_3PM }, database)).rejects.toThrow(
      PROJECT_ERRORS.dueTimeNeedsDate
    )
    await updateTask(actor(ben), { taskId: ids[0], dueDate: "2099-03-10" }, database)
    await expect(updateTask(actor(ben), { taskId: ids[0], dueAt: BY_3PM }, database)).rejects.toThrow(
      PROJECT_ERRORS.dueTimeNeedsDate
    )
  })

  it("is kept by Duplicate", async () => {
    const { ids } = await benWithTasks(["Deck"])
    await updateTask(actor(ben), { taskId: ids[0], dueDate: MONDAY, dueAt: BY_3PM }, database)
    const copy = await duplicateTask(actor(ben), ids[0], database)
    expect((await dueAtOf(copy.id)).dueAt).toBe(BY_3PM)
  })
})

describe("Catch up on overdue", () => {
  it("moves the ticked tasks in one change, each counting as a date move", async () => {
    const { ids } = await benWithTasks(["Late one", "Late two", "Kept"])
    for (const id of ids) await updateTask(actor(ben), { taskId: id, dueDate: "2099-02-20" }, database)

    const outcome = await changeManyTasks(
      actor(ben),
      { taskIds: ids.slice(0, 2), change: { kind: "due", dueDate: TUESDAY } },
      database
    )
    expect(outcome).toEqual({ changed: ids.slice(0, 2), refused: [] })
    const cards = await listTaskCards(inArray(projectTasks.id, ids), database)
    const byTitle = Object.fromEntries(cards.map((card) => [card.title, card]))
    expect(byTitle["Late one"]).toMatchObject({ dueDate: TUESDAY, dueMoves: 1 })
    expect(byTitle["Kept"]).toMatchObject({ dueDate: "2099-02-20", dueMoves: 0 })

    await changeManyTasks(actor(ben), { taskIds: [ids[1]], change: { kind: "due", dueDate: null } }, database)
    expect((await listTaskCards(eq(projectTasks.id, ids[1]), database))[0].dueDate).toBeNull()
  })
})
