import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { PERSONAL_PROJECT_ID } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { findMembership, inTeam } from "@/server/project/access"
import { submitCheckin } from "@/server/project/checkins"
import { createInvite, createInvites } from "@/server/project/invites"
import {
  addProjectMember,
  copyProject,
  createProject,
  loadProjectPage,
  loadProjectsPage,
  updateProject,
} from "@/server/project/projects"
import { sendTeamMorningNotices } from "@/server/project/reminder-jobs"
import { projectNoticeLinks, projectProjectMembers, projectTeamMembers } from "@/server/project/schema"
import { moveTask } from "@/server/project/task-changes"
import { assignTask, createTask, loadTaskDetail } from "@/server/project/tasks"
import { joinTeamByLink, makeJoinLink } from "@/server/project/team-running"
import { loadTeammate } from "@/server/project/teammate"
import { createTeam, listTeamMembers, loadTeamDashboard, updateTeam } from "@/server/project/teams"
import { insertEmployee, insertSiteAdmin, startTeam } from "@/server/project/test-people"
import { customShellNotifications, customShellUsers, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * Employees and the site admin (workspace/tasks/Admin/01-employees-and-the-site-admin.md).
 * Tyler, 16 Oct 2026: Project's people are employees, shell accounts with
 * Project's own role, and the site admin runs every team without being on one.
 *
 * 2 March 2099 is a Monday; the team works Monday to Friday at 9:00 UTC.
 */
const MONDAY = "2099-03-02"
const at = (iso: string) => new Date(iso)

let client: PGlite
let database: CustomShellDb
let tyler: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser
let teamId: string

const actor = (user: CustomShellUser) => ({
  id: user.id,
  name: user.name,
  currentWorkspaceId: user.currentWorkspaceId,
})

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  tyler = await insertSiteAdmin(database)
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
  teamId = (await startTeam(database, [ben, carla], { admin: tyler })).team.id
})

afterEach(async () => {
  await client.close()
})

function task(projectId: string, title: string, assigneeUserId: string | null) {
  return { projectId, title, notes: "", assigneeUserId, dueDate: null, steps: [] }
}

async function roleOf(userId: string) {
  const [row] = await database
    .select({ role: customShellUsers.role, passwordHash: customShellUsers.passwordHash })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
  return row
}

describe("an invite makes an employee", () => {
  it("makes an employee account with no password and puts it on the team at once", () =>
    // The site admin is on no team, so each step names this one.
    inTeam(teamId, async () => {
      const sent = await createInvite(actor(tyler), { email: "Dan.Okafor@Example.test" }, database)
      const dan = await roleOf(sent.userId)
      expect(dan).toEqual({ role: "employee", passwordHash: null })
      const members = await listTeamMembers(teamId, database)
      expect(members.find((member) => member.userId === sent.userId)).toMatchObject({
        name: "Dan Okafor",
        email: "dan.okafor@example.test",
        invited: true,
      })
    }))

  it("refuses an address that is on a team, and an account that isn't an employee", () =>
    // The site admin is on no team, so each step names this one.
    inTeam(teamId, async () => {
      await expect(createInvite(actor(tyler), { email: ben.email }, database)).rejects.toThrow(
        PROJECT_ERRORS.emailOnATeam
      )
      const member = await insertUser(database, { email: "member@example.test" })
      await expect(createInvite(actor(tyler), { email: member.email }, database)).rejects.toThrow(
        PROJECT_ERRORS.emailNotAnEmployee
      )
      expect((await createInvites(actor(tyler), { emails: [ben.email, member.email, "nope"] }, database)).map(
        (outcome) => outcome.result
      )).toEqual(["on_team", "not_an_employee", "not_an_email"])
    }))

  it("puts an employee with no team on this one, keeping their account", () =>
    // The site admin is on no team, so each step names this one.
    inTeam(teamId, async () => {
      const eve = await insertEmployee(database, { name: "Eve", email: "eve@example.test" })
      const sent = await createInvite(actor(tyler), { email: eve.email }, database)
      expect(sent.userId).toBe(eve.id)
      expect((await findMembership(eve.id, database))?.teamId).toBe(teamId)
    }))

  it("lets only the site admin invite and make teams", async () => {
    await expect(createInvite(actor(ben), { email: "x@example.test" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
    await expect(createTeam(ben.id, { name: "Mine", timeZone: "UTC" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
  })

  it("joins through the link signed out, as an employee, and tells the site admin on the right team", () =>
    // The site admin is on no team, so each step names this one.
    inTeam(teamId, async () => {
      const { link } = await makeJoinLink(tyler.id, database)
      const token = decodeURIComponent(link.split("/join/")[1])
      await joinTeamByLink({ name: "Fay", email: "fay@example.test" }, token, database)
      const fay = (await listTeamMembers(teamId, database)).find((member) => member.email === "fay@example.test")
      expect(fay?.invited).toBe(true)
      expect((await roleOf(fay!.userId)).role).toBe("employee")
      const joined = await database
        .select({ href: projectNoticeLinks.href, kind: projectNoticeLinks.kind })
        .from(customShellNotifications)
        .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
        .where(eq(customShellNotifications.recipientUserId, tyler.id))
      expect(joined).toEqual([{ kind: "team_joined", href: `/teams/${teamId}/members` }])
      await expect(joinTeamByLink({ name: "Ben", email: ben.email }, token, database)).rejects.toThrow(
        PROJECT_ERRORS.joinEmailTaken
      )
    }))
})

describe("the site admin", () => {
  it("alone makes and copies projects", async () => {
    await expect(createProject(ben.id, { name: "Mine", color: "blue", description: "" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
    const made = await inTeam(teamId, () => createProject(tyler.id, { name: "Launch", color: "blue", description: "" }, database))
    await addProjectMember(tyler.id, made.id, ben.id, database)
    await expect(copyProject(ben.id, { projectId: made.id, name: "Launch 2" }, database)).rejects.toThrow(
      PROJECT_ERRORS.onlySiteAdminSettings
    )
    await copyProject(tyler.id, { projectId: made.id, name: "Launch 2" }, database)
  })

  it("is on no team, in no member list, and isn't made a member of the projects they create", async () => {
    expect(await listTeamMembers(teamId, database)).toHaveLength(2)
    const made = await inTeam(teamId, () => createProject(tyler.id, { name: "Launch", color: "blue", description: "" }, database))
    const members = await database
      .select({ userId: projectProjectMembers.userId })
      .from(projectProjectMembers)
      .where(eq(projectProjectMembers.projectId, made.id))
    expect(members).toEqual([])
    const rows = await database
      .select({ userId: projectTeamMembers.userId })
      .from(projectTeamMembers)
      .where(eq(projectTeamMembers.userId, tyler.id))
    expect(rows).toEqual([])
  })

  it("opens the team a request names, and no team without one", async () => {
    const other = await createTeam(tyler.id, { name: "Beta", timeZone: "UTC" }, database)
    expect(await loadTeamDashboard(tyler.id, database)).toBeNull()
    expect((await inTeam(other.id, () => loadTeamDashboard(tyler.id, database)))?.team.name).toBe("Beta")
    expect((await inTeam(teamId, () => loadTeamDashboard(tyler.id, database)))?.team.name).toBe("Acme")
    // An employee's team is their own, whatever a request names.
    expect((await inTeam(other.id, () => loadTeamDashboard(ben.id, database)))?.team.id).toBe(teamId)
  })

  it("sees every Just me list, by its person's name", async () => {
    await createTask(actor(ben), task(PERSONAL_PROJECT_ID, "Ben's own", ben.id), database)
    const page = await loadProjectsPage(tyler.id, database)
    expect(page.projects.map((project) => project.name)).toContain("Just me · Ben")
    expect((await loadProjectsPage(carla.id, database)).projects.map((project) => project.name)).not.toContain(
      "Just me · Ben"
    )
  })

  it("can take a task on any project without joining it, and nobody else can give them one", () =>
    // Tyler, 19 Oct 2026: "I should be able to assign myself (admin)".
    inTeam(teamId, async () => {
      const launch = (await createProject(tyler.id, { name: "Launch", color: "blue", description: "" }, database)).id
      const later = (await createProject(tyler.id, { name: "Later", color: "red", description: "" }, database)).id
      await addProjectMember(tyler.id, launch, ben.id, database)
      const mine = (await createTask(actor(tyler), task(launch, "Mine", tyler.id), database)).id
      const bens = (await createTask(actor(ben), task(launch, "Ben's", null), database)).id
      await expect(assignTask(actor(ben), { taskId: bens, assigneeUserId: tyler.id }, database)).rejects.toThrow(
        PROJECT_ERRORS.notProjectMember
      )
      await assignTask(actor(tyler), { taskId: bens, assigneeUserId: tyler.id }, database)
      const page = await loadProjectPage(tyler.id, launch, database)
      expect(page.tasks.filter((card) => card.assignee?.id === tyler.id).map((card) => card.title).sort()).toEqual([
        "Ben's",
        "Mine",
      ])
      // Still not a member: the project's people and its count are unchanged.
      expect(page.members.map((member) => member.userId)).toEqual([ben.id])
      expect(page.siteAdminMe).toMatchObject({ userId: tyler.id, openTasks: 2 })
      expect((await loadProjectPage(ben.id, launch, database)).siteAdminMe).toBeNull()
      expect((await loadTaskDetail(tyler.id, mine, database)).assignable.map((person) => person.id)).toEqual([
        ben.id,
        tyler.id,
      ])
      // Moved to a project they aren't on either, the task stays theirs.
      expect(await moveTask(actor(tyler), { taskId: mine, projectId: later }, database)).toEqual({ keptAssignee: true })
    }))

  it("gets no check-in, and a Just me list of their own on no team (23 Oct 2026)", () =>
    // The site admin is on no team, so each step names this one.
    inTeam(teamId, async () => {
      await expect(
        submitCheckin(tyler.id, { answers: [], picks: [] }, database, at(`${MONDAY}T08:00:00Z`))
      ).rejects.toThrow(PROJECT_ERRORS.siteAdminNoCheckin)
      const { id } = await createTask(actor(tyler), task(PERSONAL_PROJECT_ID, "Mine", null), database)
      const detail = await loadTaskDetail(tyler.id, id, database)
      expect(detail.task.projectName).toBe("Just me")
      // Not this team's: the list sits in the site admin's own space.
      expect((await loadProjectsPage(tyler.id, database, teamId)).projects.map((p) => p.name)).not.toContain("Just me")
    }))

  it("alone gets the morning notice, opening on the team", async () => {
    await sendTeamMorningNotices(database, at(`${MONDAY}T09:30:00Z`))
    const morning = await database
      .select({ recipient: customShellNotifications.recipientUserId, href: projectNoticeLinks.href })
      .from(customShellNotifications)
      .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
      .where(eq(projectNoticeLinks.kind, "team_morning"))
    expect(morning).toEqual([{ recipient: tyler.id, href: `/teams/${teamId}?day=${MONDAY}` }])
  })

  it("sees a person's private things on their page, which a teammate doesn't", () =>
    // The site admin is on no team, so each step names this one.
    inTeam(teamId, async () => {
      const forTyler = await loadTeammate(tyler.id, ben.id, database)
      expect(forTyler.private).toMatchObject({ record: { onTime: 0, of: 0 }, notesLeft: [] })
      expect((await loadTeammate(carla.id, ben.id, database)).private).toBeNull()
    }))
})

describe("team roles give no powers", () => {
  it("refuses a former owner the team's settings and a project's settings", async () => {
    // Stored rows from before keep their words; they read as members now.
    await database.update(projectTeamMembers).set({ role: "owner" }).where(eq(projectTeamMembers.userId, ben.id))
    expect((await findMembership(ben.id, database))?.role).toBe("member")
    await expect(updateTeam(ben.id, { name: "Ben's team" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
    const made = await inTeam(teamId, () => createProject(tyler.id, { name: "Site", color: "blue", description: "" }, database))
    await addProjectMember(tyler.id, made.id, ben.id, database)
    await expect(updateProject(ben.id, { projectId: made.id, name: "Renamed" }, database)).rejects.toThrow(
      PROJECT_ERRORS.onlySiteAdminSettings
    )
    await updateProject(tyler.id, { projectId: made.id, name: "Renamed" }, database)
  })
})
