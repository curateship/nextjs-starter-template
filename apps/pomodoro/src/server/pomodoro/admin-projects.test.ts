import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  deleteAdminProjects,
  listAdminProjects,
  loadAdminProject,
  setAdminProjectArchived,
  updateAdminProject,
} from "@/server/pomodoro/admin-projects"
import { createProject, listProjects, renameProject } from "@/server/pomodoro/projects"
import {
  focusSessions,
  pomodoroAuditLogs,
  pomodoroNoticeLinks,
  pomodoroProjects,
  pomodoroTaskRepeats,
  tasks,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { noticeKindFromWords } from "@/lib/pomodoro/notices"

/** Projects in the admin (admin task 07), against a real database. */

let client: PGlite
let db: CustomShellDb
let admin: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  admin = (await insertUser(db, { role: "admin" })).id
})

afterEach(async () => {
  await client.close()
})

const LIST = {
  search: "",
  state: "all",
  visibility: "all",
  target: "all",
  sort: "created",
  direction: "desc",
  page: 1,
  pageSize: 25,
} as const

async function person(name: string) {
  return (await insertUser(db, { name })).id
}

async function task(userId: string, projectId: string, title: string, status = "active") {
  const [row] = await db
    .insert(tasks)
    .values({ userId, projectId, title, status, plannedDate: "2026-10-07" })
    .returning()
  return row.id
}

async function focus(userId: string, taskId: string, minutes: number, completedAt = new Date()) {
  await db.insert(focusSessions).values({
    userId,
    taskId,
    mode: "focus",
    status: "completed",
    plannedSeconds: minutes * 60,
    accumulatedSeconds: minutes * 60,
    completedAt,
    idempotencyKey: `key-${Math.random()}`,
  })
}

async function noticesFor(userId: string) {
  return db
    .select({ message: customShellNotifications.message, kind: pomodoroNoticeLinks.kind })
    .from(customShellNotifications)
    .innerJoin(pomodoroNoticeLinks, eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, userId))
}

describe("the projects list", () => {
  it("shows the same tasks and hours the owner's own card shows, and this period against the target", async () => {
    const ana = await person("Ana")
    const thesis = await createProject(ana, "Thesis")
    await renameProject(ana, thesis.id, "Thesis", { hours: 10, period: "week" })
    const write = await task(ana, thesis.id, "Write")
    await task(ana, thesis.id, "Write", "carried")
    await focus(ana, write, 120)
    // Forty days ago counts all time, but not this week.
    await focus(ana, write, 60, new Date(Date.now() - 40 * 86_400_000))

    const { rows, total } = await listAdminProjects(LIST)
    const [own] = await listProjects(ana)
    expect(total).toBe(1)
    expect(rows[0]).toMatchObject({
      name: "Thesis",
      ownerName: "Ana",
      taskCount: own.taskCount,
      focusSeconds: own.focusSeconds,
      targetHours: 10,
      targetPeriod: "week",
      periodSeconds: 2 * 3_600,
    })
    expect([own.taskCount, own.focusSeconds]).toEqual([1, 3 * 3_600])
  })

  it("searches by owner, filters, and sorts by hours", async () => {
    const [ana, ben] = await Promise.all(["Ana", "Ben"].map(person))
    const busy = await createProject(ana, "Busy")
    const quiet = await createProject(ben, "Quiet")
    await focus(ana, await task(ana, busy.id, "One"), 300)
    await db.update(pomodoroProjects).set({ archivedAt: new Date(), isPublic: true }).where(eq(pomodoroProjects.id, quiet.id))

    const byHours = await listAdminProjects({ ...LIST, sort: "hours", direction: "desc" })
    expect(byHours.rows.map((row) => row.name)).toEqual(["Busy", "Quiet"])
    expect((await listAdminProjects({ ...LIST, search: "ben" })).rows.map((row) => row.name)).toEqual(["Quiet"])
    expect((await listAdminProjects({ ...LIST, state: "archived" })).rows.map((row) => row.name)).toEqual(["Quiet"])
    expect((await listAdminProjects({ ...LIST, visibility: "private" })).rows.map((row) => row.name)).toEqual(["Busy"])
    expect((await listAdminProjects({ ...LIST, target: "target" })).total).toBe(0)
    expect((await listAdminProjects({ ...LIST, user: ana })).rows.map((row) => row.name)).toEqual(["Busy"])
    expect(byHours.rows[1].periodSeconds).toBeNull()
  })

  it("opens one project with its newest tasks, carried copies left out", async () => {
    const ana = await person("Ana")
    const project = await createProject(ana, "Thesis")
    await task(ana, project.id, "Read")
    await task(ana, project.id, "Read", "carried")
    const { project: shown, tasks: newest } = await loadAdminProject(project.id)
    expect(shown.name).toBe("Thesis")
    expect(newest.map((row) => row.title)).toEqual(["Read"])
    await expect(loadAdminProject(crypto.randomUUID())).rejects.toThrow("PROJECT_NOT_FOUND")
  })
})

describe("changing a project", () => {
  it("renames and retargets in one logged change, and tells the owner once", async () => {
    const ana = await person("Ana")
    const project = await createProject(ana, "Thesis")

    expect(
      await updateAdminProject({ projectId: project.id, name: "PhD", target: { hours: 30, period: "month" }, actorUserId: admin })
    ).toEqual({ changed: true })
    const [row] = await db.select().from(pomodoroProjects).where(eq(pomodoroProjects.id, project.id))
    expect([row.name, row.targetHours, row.targetPeriod]).toEqual(["PhD", 30, "month"])
    expect(await db.select().from(pomodoroAuditLogs)).toMatchObject([
      { actorUserId: admin, action: "edit", resource: "projects", recordIds: [project.id] },
    ])
    expect(await noticesFor(ana)).toEqual([
      {
        kind: "project_changed",
        message: "The Pomoder team changed your project Thesis: it is now PhD, with a new target.",
      },
    ])

    // The same values again change nothing and write nothing.
    expect(
      await updateAdminProject({ projectId: project.id, name: "PhD", target: { hours: 30, period: "month" }, actorUserId: admin })
    ).toEqual({ changed: false })
    expect(await db.select().from(pomodoroAuditLogs)).toHaveLength(1)
  })

  it("refuses a name the owner already uses on a live project, ignoring case", async () => {
    const [ana, ben] = await Promise.all(["Ana", "Ben"].map(person))
    await createProject(ana, "Thesis")
    const other = await createProject(ana, "Notes")
    await expect(
      updateAdminProject({ projectId: other.id, name: "THESIS", target: null, actorUserId: admin })
    ).rejects.toThrow("PROJECT_NAME_TAKEN")
    // Another person's project may share it.
    const bens = await createProject(ben, "Notes")
    await updateAdminProject({ projectId: bens.id, name: "Thesis", target: null, actorUserId: admin })
    expect(await noticesFor(ana)).toEqual([])
    expect(await noticesFor(ben)).toEqual([
      { kind: "project_changed", message: "The Pomoder team renamed your project Notes to Thesis." },
    ])
  })

  it("archives and brings back, and refuses to bring back over a live name", async () => {
    const ana = await person("Ana")
    const project = await createProject(ana, "Thesis")
    await setAdminProjectArchived({ projectId: project.id, archived: true, actorUserId: admin })
    await createProject(ana, "thesis")
    await expect(
      setAdminProjectArchived({ projectId: project.id, archived: false, actorUserId: admin })
    ).rejects.toThrow("PROJECT_NAME_TAKEN")
    expect((await db.select().from(pomodoroAuditLogs)).map((row) => row.action)).toEqual(["archive"])
    expect(await noticesFor(ana)).toEqual([
      { kind: "project_changed", message: "The Pomoder team archived your project Thesis." },
    ])
  })
})

describe("an admin's own project", () => {
  it("is changed and deleted without a notice to themselves, and still logged", async () => {
    const project = await createProject(admin, "Mine")
    await updateAdminProject({ projectId: project.id, name: "Still mine", target: null, actorUserId: admin })
    await setAdminProjectArchived({ projectId: project.id, archived: true, actorUserId: admin })
    await deleteAdminProjects({ ids: [project.id], actorUserId: admin })
    expect(await noticesFor(admin)).toEqual([])
    expect((await db.select().from(pomodoroAuditLogs)).map((row) => row.action)).toEqual(["edit", "archive", "delete"])
  })
})

describe("deleting projects", () => {
  it("keeps the tasks, repeat rules and hours with no project, and tells each owner", async () => {
    const [ana, ben] = await Promise.all(["Ana", "Ben"].map(person))
    const thesis = await createProject(ana, "Thesis")
    const gym = await createProject(ben, "Gym")
    const write = await task(ana, thesis.id, "Write")
    await focus(ana, write, 25)
    await db.insert(pomodoroTaskRepeats).values({ userId: ana, title: "Write", projectId: thesis.id, weekdays: 127 })
    const missing = crypto.randomUUID()

    const result = await deleteAdminProjects({ ids: [thesis.id, gym.id, missing], actorUserId: admin })

    expect(result.deleted.sort()).toEqual([thesis.id, gym.id].sort())
    expect(result.skipped).toEqual([missing])
    expect(await listProjects(ana)).toEqual([])
    const [kept] = await db.select().from(tasks).where(eq(tasks.id, write))
    expect(kept.projectId).toBeNull()
    expect((await db.select().from(pomodoroTaskRepeats))[0].projectId).toBeNull()
    expect(await db.select().from(focusSessions)).toHaveLength(1)
    expect(await noticesFor(ana)).toEqual([
      { kind: "project_deleted", message: "The Pomoder team deleted your project Thesis. Its tasks are kept." },
    ])
    expect(await db.select().from(pomodoroAuditLogs)).toMatchObject([
      { action: "delete", resource: "projects" },
    ])
  })

  it("writes nothing when every id is already gone", async () => {
    const result = await deleteAdminProjects({ ids: [crypto.randomUUID()], actorUserId: admin })
    expect(result.deleted).toEqual([])
    expect(await db.select().from(pomodoroAuditLogs)).toEqual([])
  })
})

describe("the project notices", () => {
  it("are read back as their own kinds for the bell's first paint", () => {
    for (const message of [
      "The Pomoder team renamed your project A to B.",
      "The Pomoder team changed the target on your project A.",
      "The Pomoder team archived your project A.",
      "The Pomoder team brought back your project A.",
    ])
      expect(noticeKindFromWords({ type: "app_activity", message })).toBe("project_changed")
    expect(
      noticeKindFromWords({ type: "app_activity", message: "The Pomoder team deleted your project A. Its tasks are kept." })
    ).toBe("project_deleted")
  })
})
