import { PGlite } from "@electric-sql/pglite"
import { and, asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { NO_CLIENT_FILTER, clientChoices, matchesClient } from "@/lib/project/clients"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { savedViewFiltersSchema, viewFilters } from "@/lib/project/saved-views"
import { filterTasks, readTaskFilters } from "@/lib/project/task-filters"
import type { CustomShellDb } from "@/server/db"
import { inTeam, requireMembership } from "@/server/project/access"
import { visibleClients } from "@/server/project/clients"
import { createMilestone, setTaskMilestone } from "@/server/project/milestones"
import { setNoticeSwitch } from "@/server/project/notice-switches"
import { setRepeat } from "@/server/project/planning"
import { makeRepeatCopies } from "@/server/project/planning-jobs"
import {
  addProjectMember,
  loadProjectPage,
  removeProjectMember,
  setProjectArchived,
  setProjectClient,
  setProjectHealth,
  setProjectLead,
  updateProject,
} from "@/server/project/projects"
import { sendMilestoneReminders } from "@/server/project/reminder-jobs"
import {
  projectMilestones,
  projectNoticeLinks,
  projectTaskFollowers,
  projectTasks,
  projectTeamMembers,
} from "@/server/project/schema"
import { loadTeamDueDates, setCalendarDueDates } from "@/server/project/team-due-dates"
import { loadNeedsAttention, loadWorkload } from "@/server/project/team-running"
import { reviewTask, setNeedsReview } from "@/server/project/task-review"
import { createTaskType, createTypeField, setTaskFieldValue, setTaskType } from "@/server/project/task-types"
import {
  addStep,
  createTask,
  loadTaskDetail,
  setTaskStatus,
  updateStep,
  updateTask,
} from "@/server/project/tasks"
import { addTimeOff, awayBetween } from "@/server/project/time-off"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { insertEmployee, projectFor, startTeam } from "@/server/project/test-people"
import { createTestDatabase } from "@/server/test-support"

/*
 * Features 16 Oct 2026. Dates are in 2099 so nothing meets the real today:
 * 2 March 2099 is a Monday, 6 March a Friday. The team works Monday to Friday
 * at 9:00 UTC.
 */
const MONDAY = "2099-03-02"
const TUESDAY = "2099-03-03"
const WEDNESDAY = "2099-03-04"
const FRIDAY = "2099-03-06"
const at = (iso: string) => new Date(iso)

let client: PGlite
let database: CustomShellDb
let admin: CustomShellUser
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let teamId: string
let website: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name })

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertEmployee(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertEmployee(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertEmployee(database, { name: "Carla", email: "carla@example.test" })
  // The site admin runs the team; Anna, Ben and Carla work on it, all on
  // Website. Anna made Website, and the site admin put Ben and Carla on it.
  const started = await startTeam(database, [anna, ben, carla])
  admin = started.admin
  teamId = started.team.id
  website = (await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)).id
  await addProjectMember(admin.id, website, ben.id, database)
  await addProjectMember(admin.id, website, carla.id, database)
})

afterEach(async () => {
  await client.close()
})

async function noticesFor(user: CustomShellUser, kind: string) {
  return database
    .select({
      message: customShellNotifications.message,
      detail: customShellNotifications.detail,
      href: projectNoticeLinks.href,
    })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(and(eq(customShellNotifications.recipientUserId, user.id), eq(projectNoticeLinks.kind, kind)))
    .orderBy(asc(customShellNotifications.createdAt))
}

async function task(title: string, input: { assignee?: CustomShellUser | null; dueDate?: string | null } = {}) {
  const { id } = await createTask(
    actor(anna),
    {
      projectId: website,
      title,
      notes: "",
      assigneeUserId: input.assignee === undefined ? ben.id : (input.assignee?.id ?? null),
      dueDate: input.dueDate ?? null,
      steps: [],
    },
    database
  )
  return id
}

describe("part 1: telling the project when its status changes", () => {
  it("is the site admin's to set, and tells everyone on the project, with the reason", async () => {
    // A project's status is one of its settings, so it is the site admin's alone.
    await expect(
      setProjectHealth(ben.id, { projectId: website, health: "at_risk", note: "Photos are late" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.onlySiteAdminSettings)
    await setProjectHealth(admin.id, { projectId: website, health: "at_risk", note: "Photos are late" }, database)
    // The site admin set it and is on no project, so they hear nothing.
    expect(await noticesFor(admin, "project_health")).toEqual([])
    for (const person of [anna, ben, carla]) {
      expect(await noticesFor(person, "project_health")).toEqual([
        { message: "Tyler marked a project At risk", detail: "Website: Photos are late", href: `/projects/${website}` },
      ])
    }
  })

  it("tells them it is over when it goes back to On track or is cleared, and not otherwise", async () => {
    // On track from no status is not news.
    await setProjectHealth(admin.id, { projectId: website, health: "on_track", note: "" }, database)
    expect(await noticesFor(ben, "project_health")).toEqual([])
    await setProjectHealth(admin.id, { projectId: website, health: "off_track", note: "Lost the designer" }, database)
    // The same status again tells nobody twice.
    await setProjectHealth(admin.id, { projectId: website, health: "off_track", note: "Still no designer" }, database)
    expect(await noticesFor(ben, "project_health")).toHaveLength(1)
    await setProjectHealth(admin.id, { projectId: website, health: null, note: "" }, database)
    expect(await noticesFor(ben, "project_health")).toEqual([
      { message: "Tyler cleared a project's status", detail: "Website: Was Off track.", href: `/projects/${website}` },
    ])
  })

  it("keeps one row per person per project within the hour, holding the latest status", async () => {
    await setProjectHealth(admin.id, { projectId: website, health: "at_risk", note: "Photos are late" }, database)
    await setProjectHealth(admin.id, { projectId: website, health: "on_track", note: "" }, database)
    const rows = await noticesFor(carla, "project_health")
    expect(rows.map((row) => row.message)).toEqual(["Tyler marked a project On track"])
  })

  it("respects the person's own switch", async () => {
    await setNoticeSwitch(carla.id, { id: "project_health", on: false }, database)
    await setProjectHealth(admin.id, { projectId: website, health: "at_risk", note: "Photos are late" }, database)
    expect(await noticesFor(carla, "project_health")).toEqual([])
    expect(await noticesFor(ben, "project_health")).toHaveLength(1)
  })
})

describe("part 2: milestones and project due dates", () => {
  it("puts milestones not yet reached and projects due on the calendar's due dates", async () => {
    const launch = (await createMilestone(anna.id, { projectId: website, name: "Launch", dueDate: WEDNESDAY }, database)).id
    const design = (await createMilestone(anna.id, { projectId: website, name: "Design", dueDate: TUESDAY }, database)).id
    await updateProject(admin.id, { projectId: website, dueDate: FRIDAY }, database)
    // Design's only task is Done, so Design is reached and leaves the calendar.
    const logo = await task("Logo")
    await setTaskMilestone(anna.id, { taskId: logo, milestoneId: design }, database)
    await setTaskStatus(actor(ben), { taskId: logo, status: "done", stuckReason: null }, database)
    const archived = (await projectFor(admin, anna.id, { name: "Old", color: "red", description: "" }, database)).id
    await createMilestone(anna.id, { projectId: archived, name: "Gone", dueDate: WEDNESDAY }, database)
    await setProjectArchived(admin.id, archived, true, database)

    const membership = await requireMembership(ben.id, database)
    expect((await loadTeamDueDates(membership, MONDAY, FRIDAY, database)).deadlines).toEqual([])
    // The switch is each person's own.
    await setCalendarDueDates(ben.id, true, database)
    const { deadlines } = await loadTeamDueDates(membership, MONDAY, FRIDAY, database)
    expect(deadlines.map((d) => [d.kind, d.name, d.dueDate])).toEqual([
      ["milestone", "Launch", WEDNESDAY],
      ["project", "Website", FRIDAY],
    ])
    expect(deadlines[0]).toMatchObject({ id: launch, projectId: website, projectName: "Website" })
  })

  it("tells the lead the day before, once per date, and nobody once it is reached", async () => {
    const launch = (await createMilestone(anna.id, { projectId: website, name: "Launch", dueDate: WEDNESDAY }, database)).id
    await setProjectLead(admin.id, { projectId: website, userId: ben.id }, database)

    await sendMilestoneReminders(database, at(`${TUESDAY}T08:59:00Z`))
    expect(await noticesFor(ben, "milestone_due")).toEqual([])
    await sendMilestoneReminders(database, at(`${TUESDAY}T09:00:00Z`))
    await sendMilestoneReminders(database, at(`${TUESDAY}T09:00:15Z`))
    expect(await noticesFor(ben, "milestone_due")).toEqual([
      { message: "Milestone due tomorrow", detail: "Launch · Website", href: `/projects/${website}` },
    ])
    // The lead gets it, so the site admin doesn't.
    expect(await noticesFor(admin, "milestone_due")).toEqual([])

    // Moved to Thursday: a fresh one on Wednesday.
    await database.update(projectMilestones).set({ dueDate: "2099-03-05" }).where(eq(projectMilestones.id, launch))
    await sendMilestoneReminders(database, at(`${WEDNESDAY}T09:00:00Z`))
    expect(await noticesFor(ben, "milestone_due")).toHaveLength(2)

    // Every task Done: reached, so moving it again sends nothing.
    const page = await task("Ship it")
    await setTaskMilestone(anna.id, { taskId: page, milestoneId: launch }, database)
    await setTaskStatus(actor(ben), { taskId: page, status: "done", stuckReason: null }, database)
    await database.update(projectMilestones).set({ dueDate: FRIDAY }).where(eq(projectMilestones.id, launch))
    await sendMilestoneReminders(database, at("2099-03-05T09:00:00Z"))
    expect(await noticesFor(ben, "milestone_due")).toHaveLength(2)
  })

  it("tells the site admin when the project has no lead, and says Monday before a weekend", async () => {
    await createMilestone(anna.id, { projectId: website, name: "Launch", dueDate: "2099-03-09" }, database)
    await sendMilestoneReminders(database, at(`${FRIDAY}T09:00:00Z`))
    // The project names its own team, so the link is the project's page.
    expect(await noticesFor(admin, "milestone_due")).toEqual([
      { message: "Milestone due Monday", detail: "Launch · Website", href: `/projects/${website}` },
    ])
    for (const person of [anna, ben, carla]) expect(await noticesFor(person, "milestone_due")).toEqual([])
  })
})

describe("part 3: waiting for review in Needs attention", () => {
  it("shows the site admin a Done task waiting for its reviewer after a work day, until it is confirmed", async () => {
    await inTeam(teamId, async () => {
      // Anna asks for the review, so she is the reviewer; Needs attention is the site admin's.
      const photos = await task("Pick the photos")
      await setNeedsReview(actor(anna), { taskId: photos, on: true }, database)
      await setTaskStatus(actor(ben), { taskId: photos, status: "done", stuckReason: null }, database)
      await database
        .update(projectTasks)
        .set({ reviewWaitingSince: at(`${MONDAY}T10:00:00Z`) })
        .where(eq(projectTasks.id, photos))

      const sameDay = await loadNeedsAttention(admin.id, database, at(`${MONDAY}T15:00:00Z`))
      expect(sameDay.filter((row) => row.kind === "review_waiting")).toEqual([])

      const later = await loadNeedsAttention(admin.id, database, at(`${WEDNESDAY}T15:00:00Z`))
      expect(later.filter((row) => row.kind === "review_waiting")).toEqual([
        expect.objectContaining({
          taskId: photos,
          personName: "Ben",
          howLong: "Waiting for Anna's review for 2 work days",
          days: 2,
        }),
      ])

      await reviewTask(actor(anna), { taskId: photos, action: "confirm" }, database)
      const after = await loadNeedsAttention(admin.id, database, at(`${WEDNESDAY}T15:00:00Z`))
      expect(after.filter((row) => row.kind === "review_waiting")).toEqual([])
    })
  })
})

describe("part 4: a repeating task's next copy keeps its whole setup", () => {
  it("keeps step people, moves step dates and the start day, keeps the due time and the milestone", async () => {
    const report = await task("Send the client report", { dueDate: "2099-02-27" })
    await database.update(projectTasks).set({ createdAt: at("2099-02-20T10:00:00Z") }).where(eq(projectTasks.id, report))
    await updateTask(
      actor(anna),
      { taskId: report, startDate: "2099-02-25", dueAt: "2099-02-27T15:30:00.000Z" },
      database
    )
    const milestone = (await createMilestone(anna.id, { projectId: website, name: "Q1", dueDate: "2099-03-31" }, database)).id
    await setTaskMilestone(anna.id, { taskId: report, milestoneId: milestone }, database)
    const figures = await addStep(actor(anna), { taskId: report, text: "Gather figures" }, database)
    await updateStep(actor(anna), { stepId: figures.id, assigneeUserId: carla.id, dueDate: "2099-02-26" }, database)
    const plain = await addStep(actor(anna), { taskId: report, text: "Send it" }, database)
    await updateStep(actor(anna), { stepId: plain.id, done: true }, database)
    await setRepeat(actor(anna), { taskId: report, repeat: { every: "week", weekDays: [1] } }, database)
    await setTaskStatus(actor(ben), { taskId: report, status: "done", stuckReason: null }, database)

    await makeRepeatCopies(database, at(`${MONDAY}T00:00:30Z`))
    const copy = (await loadProjectPage(anna.id, website, database)).tasks.find((t) => t.id !== report)!
    // Due Monday 2 March, 3 days after 27 February, so every date moves 3 days.
    expect(copy).toMatchObject({
      dueDate: MONDAY,
      dueAt: `${MONDAY}T15:30:00.000Z`,
      startDate: "2099-02-28",
      milestoneId: milestone,
    })
    const steps = (await loadTaskDetail(anna.id, copy.id, database)).steps
    expect(steps.map((s) => [s.text, s.done, s.assignee?.id ?? null, s.dueDate])).toEqual([
      ["Gather figures", false, carla.id, "2099-03-01"],
      ["Send it", false, null, null],
    ])
  })

  it("leaves off a milestone already passed and a step person who left the project", async () => {
    const report = await task("Water the plants", { dueDate: "2099-02-27" })
    await database.update(projectTasks).set({ createdAt: at("2099-02-20T10:00:00Z") }).where(eq(projectTasks.id, report))
    const old = (await createMilestone(anna.id, { projectId: website, name: "February", dueDate: "2099-02-28" }, database)).id
    await setTaskMilestone(anna.id, { taskId: report, milestoneId: old }, database)
    const step = await addStep(actor(anna), { taskId: report, text: "Fill the can" }, database)
    await updateStep(actor(anna), { stepId: step.id, assigneeUserId: carla.id }, database)
    await setRepeat(actor(anna), { taskId: report, repeat: { every: "week", weekDays: [1] } }, database)
    await setTaskStatus(actor(ben), { taskId: report, status: "done", stuckReason: null }, database)
    await removeProjectMember(admin.id, website, carla.id, database)

    await makeRepeatCopies(database, at(`${MONDAY}T00:00:30Z`))
    const copy = (await loadProjectPage(anna.id, website, database)).tasks.find((t) => t.id !== report)!
    expect(copy.milestoneId).toBeNull()
    expect((await loadTaskDetail(anna.id, copy.id, database)).steps[0].assignee).toBeNull()
  })
})

describe("part 5: the database says when something of the team's changed", () => {
  it("names the team on project_team_live for time off, a project's status and a milestone", async () => {
    const heard: string[] = []
    const stop = await client.listen("project_team_live", (payload) => heard.push(payload))
    await addTimeOff(ben.id, { firstDay: FRIDAY, lastDay: FRIDAY }, database)
    await setProjectHealth(admin.id, { projectId: website, health: "at_risk", note: "Late" }, database)
    await createMilestone(anna.id, { projectId: website, name: "Launch", dueDate: FRIDAY }, database)
    // Notices arrive once the change is committed, on the next round trip.
    await client.query("SELECT 1")
    await stop()
    expect(heard.length).toBeGreaterThanOrEqual(3)
    expect(new Set(heard)).toEqual(new Set([teamId]))
  })
})

describe("part 6: time off on the Team calendar", () => {
  it("names who is away on each of the team's work days, and nobody who has left", async () => {
    // Friday to the next Tuesday: Saturday and Sunday aren't work days.
    await addTimeOff(ben.id, { firstDay: FRIDAY, lastDay: "2099-03-10" }, database)
    await addTimeOff(carla.id, { firstDay: FRIDAY, lastDay: FRIDAY }, database)
    const away = await awayBetween(teamId, [1, 2, 3, 4, 5], MONDAY, "2099-03-10", database)
    expect(away.map((day) => [day.day, day.people.map((p) => p.name)])).toEqual([
      [FRIDAY, ["Ben", "Carla"]],
      ["2099-03-09", ["Ben"]],
      ["2099-03-10", ["Ben"]],
    ])
    await database.delete(projectTeamMembers).where(eq(projectTeamMembers.userId, carla.id))
    const after = await awayBetween(teamId, [1, 2, 3, 4, 5], FRIDAY, FRIDAY, database)
    expect(after[0].people.map((p) => p.name)).toEqual(["Ben"])
  })
})

describe("part 7: Person fields tell the person", () => {
  async function reviewType() {
    const { id: typeId } = await inTeam(teamId, () =>
      createTaskType(admin.id, { name: "Video", icon: "video", color: "red" }, database)
    )
    const reviewer = (await createTypeField(admin.id, { typeId, name: "Reviewer", kind: "person" }, database)).id
    return { typeId, reviewer }
  }

  it("tells the person named and makes them follow, but never the one who named them nor the task's own person", async () => {
    await inTeam(teamId, async () => {
      const { typeId, reviewer } = await reviewType()
      const trailer = await task("Edit the trailer")
      await setTaskType(actor(anna), { taskId: trailer, typeId }, database)

      await setTaskFieldValue(actor(ben), { taskId: trailer, fieldId: reviewer, value: carla.id }, database)
      expect(await noticesFor(carla, "task_field_person")).toEqual([
        {
          message: "Ben named you on a task",
          detail: "Reviewer on Edit the trailer",
          href: `/projects/${website}?task=${trailer}`,
        },
      ])
      const followers = await database
        .select({ userId: projectTaskFollowers.userId })
        .from(projectTaskFollowers)
        .where(eq(projectTaskFollowers.taskId, trailer))
      expect(followers.map((row) => row.userId)).toContain(carla.id)

      // Saving the same person again says nothing new.
      await setTaskFieldValue(actor(anna), { taskId: trailer, fieldId: reviewer, value: carla.id }, database)
      expect(await noticesFor(carla, "task_field_person")).toHaveLength(1)
      // Ben is the task's own person; Anna names herself.
      await setTaskFieldValue(actor(anna), { taskId: trailer, fieldId: reviewer, value: ben.id }, database)
      await setTaskFieldValue(actor(anna), { taskId: trailer, fieldId: reviewer, value: anna.id }, database)
      expect(await noticesFor(ben, "task_field_person")).toEqual([])
      expect(await noticesFor(anna, "task_field_person")).toEqual([])
    })
  })

  it("tells the person named when the task is made with the field filled", async () => {
    await inTeam(teamId, async () => {
      const { typeId, reviewer } = await reviewType()
      await createTask(
        actor(anna),
        {
          projectId: website,
          title: "Cut the teaser",
          notes: "",
          assigneeUserId: ben.id,
          dueDate: null,
          steps: [],
          typeId,
          fieldValues: { [reviewer]: carla.id },
        },
        database
      )
      expect((await noticesFor(carla, "task_field_person")).map((n) => n.detail)).toEqual(["Reviewer on Cut the teaser"])
    })
  })
})

describe("part 9: filtering by client", () => {
  it("matches a client ignoring capitals and spaces, and lists each client once", () => {
    expect(matchesClient(" Hart dental ", "Hart Dental")).toBe(true)
    expect(matchesClient(null, NO_CLIENT_FILTER)).toBe(true)
    expect(matchesClient("Hart Dental", NO_CLIENT_FILTER)).toBe(false)
    expect(matchesClient(null, "Hart Dental")).toBe(false)
    expect(clientChoices(["hart dental", "Acme", "Hart Dental ", null, ""])).toEqual(["Acme", "hart dental"])
  })

  it("reads the client from the address and narrows a task list by it", () => {
    expect(readTaskFilters({ client: "Hart Dental" })).toEqual({ client: "Hart Dental" })
    expect(readTaskFilters({ client: "x".repeat(61) })).toEqual({})
    const tasks = [
      { id: "a", projectClient: "Hart Dental" },
      { id: "b", projectClient: null },
    ].map((row) => ({
      ...row,
      title: row.id,
      notesText: "",
      status: "todo" as const,
      priority: "normal" as const,
      assignee: null,
      labels: [],
      type: null,
    }))
    expect(filterTasks(tasks, { client: "hart dental" }).map((t) => t.id)).toEqual(["a"])
    expect(filterTasks(tasks, { client: NO_CLIENT_FILTER }).map((t) => t.id)).toEqual(["b"])
  })

  it("keeps the client in a saved view, and refuses a client name too long to be one", () => {
    expect(viewFilters({ due: "week", client: "Hart Dental" })).toEqual({ due: "week", client: "Hart Dental" })
    expect(savedViewFiltersSchema.parse({ client: "Hart Dental" })).toEqual({ client: "Hart Dental" })
    expect(() => savedViewFiltersSchema.parse({ client: "x".repeat(61) })).toThrow()
  })

  it("counts only the picked client's work on Workload, and lists only clients the person can see", async () => {
    const shop = (await projectFor(admin, anna.id, { name: "Shop", color: "green", description: "" }, database)).id
    await setProjectClient(admin.id, { projectId: website, client: "Hart Dental" }, database)
    await setProjectClient(admin.id, { projectId: shop, client: "Secret Client" }, database)
    await task("Website task")
    await createTask(
      actor(anna),
      { projectId: shop, title: "Shop task", notes: "", assigneeUserId: anna.id, dueDate: null, steps: [] },
      database
    )
    const open = async (client?: string) =>
      Object.fromEntries(
        (await loadWorkload(anna.id, database, at(`${MONDAY}T10:00:00Z`), client)).map((row) => [row.person.name, row.counts.open])
      )
    expect(await open()).toMatchObject({ Anna: 1, Ben: 1 })
    expect(await open("hart dental")).toMatchObject({ Anna: 0, Ben: 1 })
    expect(await open(NO_CLIENT_FILTER)).toMatchObject({ Anna: 0, Ben: 0 })

    expect(await visibleClients(await requireMembership(anna.id, database), database)).toEqual([
      "Hart Dental",
      "Secret Client",
    ])
    // Ben isn't on Shop, so its client never reaches him.
    expect(await visibleClients(await requireMembership(ben.id, database), database)).toEqual(["Hart Dental"])
  })
})
