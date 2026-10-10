import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { setEmailProviderFactoryForTests } from "@/server/email/provider"
import {
  INVITE_LIMITS,
  acceptInvite,
  createInvite,
  listInvitesForMe,
  loadInviteByToken,
  resendInvite,
} from "@/server/project/invites"
import {
  PROJECT_NAV_SECTION_ID,
  addProjectNavigation,
} from "@/server/project/navigation"
import {
  addProjectMember,
  createProject,
  loadProjectPage,
  loadProjectsPage,
  removeProjectMember,
} from "@/server/project/projects"
import { projectNoticeLinks, projectTasks } from "@/server/project/schema"
import {
  acceptTask,
  addComment,
  assignTask,
  createTask,
  handBackTask,
  loadMyWork,
  loadTaskDetail,
  setTaskStatus,
} from "@/server/project/tasks"
import {
  changeMemberRole,
  createTeam,
  leaveTeam,
  removeTeamMember,
  transferOwnership,
} from "@/server/project/teams"
import {
  customShellNotifications,
  customShellSettings,
  customShellWorkspaces,
  type CustomShellUser,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let carla: CustomShellUser

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
  carla = await insertUser(database, { name: "Carla", email: "carla@example.test" })
})

afterEach(async () => {
  setEmailProviderFactoryForTests(null)
  await client.close()
})

/** Anna owns a team; Ben and Carla join it as members. */
async function teamOfThree() {
  await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
  for (const person of [ben, carla]) {
    const sent = await createInvite(actor(anna), { email: person.email, role: "member" }, database)
    await acceptInvite(person, sent.inviteId, database)
  }
}

async function noticesFor(userId: string) {
  return database
    .select({
      message: customShellNotifications.message,
      detail: customShellNotifications.detail,
      kind: projectNoticeLinks.kind,
      href: projectNoticeLinks.href,
    })
    .from(customShellNotifications)
    .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, userId))
}

describe("teams and invites", () => {
  it("makes the creator the owner and allows one team per account", async () => {
    await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
    const page = await loadProjectsPage(anna.id, database)
    expect(page.team).toMatchObject({ name: "Acme", myRole: "owner" })
    await expect(
      createTeam(anna.id, { name: "Second", timeZone: "UTC" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.alreadyOnTeam)
  })

  it("says the invite wasn't emailed when no email key is set, and still gives a link", async () => {
    await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
    const sent = await createInvite(actor(anna), { email: "Ben@Example.test", role: "member" }, database)
    expect(sent.emailed).toBe(false)
    expect(sent.link).toMatch(/\/invite\/[0-9a-f]{64}$/)
    const token = sent.link.split("/invite/")[1]
    const seen = await loadInviteByToken(ben, token, database)
    expect(seen).toMatchObject({ teamName: "Acme", blocker: null })
  })

  it("only lets the invited address accept, and shows the invite on their Projects page", async () => {
    await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
    const sent = await createInvite(actor(anna), { email: ben.email, role: "admin" }, database)

    await expect(acceptInvite(carla, sent.inviteId, database)).rejects.toThrow(
      PROJECT_ERRORS.inviteWrongEmail
    )
    expect(await listInvitesForMe(ben, database)).toHaveLength(1)
    expect(await listInvitesForMe(carla, database)).toHaveLength(0)

    await acceptInvite(ben, sent.inviteId, database)
    expect((await loadProjectsPage(ben.id, database)).team?.myRole).toBe("admin")
    expect(await listInvitesForMe(ben, database)).toHaveLength(0)
  })

  it("tells someone already on another team to leave it first", async () => {
    await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
    await createTeam(ben.id, { name: "Other", timeZone: "UTC" }, database)
    const sent = await createInvite(actor(anna), { email: ben.email, role: "member" }, database)
    const [invite] = await listInvitesForMe(ben, database)
    expect(invite.blocker).toBe("already-on-team")
    await expect(acceptInvite(ben, sent.inviteId, database)).rejects.toThrow(
      PROJECT_ERRORS.alreadyOnTeam
    )
  })

  it("caps how often one address can be emailed, even when the invite is resent", async () => {
    await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
    const first = await createInvite(actor(anna), { email: "target@example.test", role: "member" }, database)
    for (let sent = 1; sent < INVITE_LIMITS.perAddress.maxAttempts; sent++) {
      await resendInvite(actor(anna), first.inviteId, database)
    }
    await expect(resendInvite(actor(anna), first.inviteId, database)).rejects.toThrow("RATE_LIMITED")
    await expect(
      createInvite(actor(anna), { email: "target@example.test", role: "member" }, database)
    ).rejects.toThrow("RATE_LIMITED")
  })

  it("refuses invites and role changes from plain members", async () => {
    await teamOfThree()
    await expect(
      createInvite(actor(ben), { email: "new@example.test", role: "member" }, database)
    ).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    await expect(changeMemberRole(ben.id, carla.id, "admin", database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
  })

  it("hands ownership over and keeps the owner from leaving", async () => {
    await teamOfThree()
    await expect(leaveTeam(anna.id, database)).rejects.toThrow(PROJECT_ERRORS.ownerCantLeave)
    await transferOwnership(anna.id, ben.id, database)
    expect((await loadProjectsPage(ben.id, database)).team?.myRole).toBe("owner")
    expect((await loadProjectsPage(anna.id, database)).team?.myRole).toBe("admin")
    await leaveTeam(anna.id, database)
    expect((await loadProjectsPage(anna.id, database)).team).toBeNull()
  })
})

describe("who sees a project", () => {
  it("shows a project only to its members and the team's owner and admins", async () => {
    await teamOfThree()
    const { id } = await createProject(ben.id, { name: "Site", color: "blue", description: "" }, database)

    expect((await loadProjectsPage(ben.id, database)).projects.map((p) => p.id)).toEqual([id])
    expect((await loadProjectsPage(carla.id, database)).projects).toEqual([])
    // The owner sees every project without being added.
    expect((await loadProjectsPage(anna.id, database)).projects.map((p) => p.id)).toEqual([id])
    await expect(loadProjectPage(carla.id, id, database)).rejects.toThrow(
      PROJECT_ERRORS.projectNotFound
    )
  })

  it("refuses someone from another team, whatever id they guess", async () => {
    await teamOfThree()
    const outsider = await insertUser(database, { name: "Olga", email: "olga@example.test" })
    await createTeam(outsider.id, { name: "Rival", timeZone: "UTC" }, database)
    const { id } = await createProject(anna.id, { name: "Site", color: "blue", description: "" }, database)
    const task = await createTask(anna, newTask(id, { assigneeUserId: anna.id }), database)

    await expect(loadProjectPage(outsider.id, id, database)).rejects.toThrow(
      PROJECT_ERRORS.projectNotFound
    )
    await expect(loadTaskDetail(outsider.id, task.id, database)).rejects.toThrow(
      PROJECT_ERRORS.taskNotFound
    )
    await expect(
      setTaskStatus(outsider, { taskId: task.id, status: "done", stuckReason: null }, database)
    ).rejects.toThrow(PROJECT_ERRORS.taskNotFound)
  })

  it("only hands tasks to the project's members", async () => {
    await teamOfThree()
    const { id } = await createProject(anna.id, { name: "Site", color: "blue", description: "" }, database)
    await expect(
      createTask(anna, newTask(id, { assigneeUserId: carla.id }), database)
    ).rejects.toThrow(PROJECT_ERRORS.notProjectMember)
  })
})

describe("handing tasks over", () => {
  async function projectWithBen() {
    await teamOfThree()
    const { id } = await createProject(anna.id, { name: "Site", color: "blue", description: "" }, database)
    await addProjectMember(anna.id, id, ben.id, database)
    return id
  }

  it("keeps a handed-over task Waiting until it's accepted, and tells the person", async () => {
    const projectId = await projectWithBen()
    const { id } = await createTask(anna, newTask(projectId, { assigneeUserId: ben.id }), database)

    let [card] = await loadMyWork(ben.id, database)
    expect(card).toMatchObject({ id, waiting: true, assignedBy: { name: "Anna" } })
    expect(await noticesFor(ben.id)).toEqual([
      expect.objectContaining({
        message: "Anna gave you a task",
        kind: "task_assigned",
        href: `/projects/${projectId}?task=${id}`,
      }),
    ])

    await expect(acceptTask(carla, id, database)).rejects.toThrow()
    await acceptTask(ben, id, database)
    ;[card] = await loadMyWork(ben.id, database)
    expect(card.waiting).toBe(false)
  })

  it("skips Waiting when you take a task yourself, and tells nobody", async () => {
    const projectId = await projectWithBen()
    const { id } = await createTask(ben, newTask(projectId, { assigneeUserId: ben.id }), database)
    expect((await loadMyWork(ben.id, database))[0]).toMatchObject({ id, waiting: false })
    expect(await noticesFor(ben.id)).toEqual([])
  })

  it("hands a task back to whoever handed it out, with the reason", async () => {
    const projectId = await projectWithBen()
    const { id } = await createTask(anna, newTask(projectId, { assigneeUserId: ben.id }), database)
    await handBackTask(ben, { taskId: id, reason: "Not my area" }, database)

    const detail = await loadTaskDetail(anna.id, id, database)
    expect(detail.task).toMatchObject({
      assignee: { id: anna.id },
      waiting: false,
      handedBack: { byName: "Ben", reason: "Not my area" },
    })
    expect(await noticesFor(anna.id)).toEqual([
      expect.objectContaining({
        message: "Ben handed a task back to you",
        detail: "Write the brief: Not my area",
      }),
    ])
  })

  it("needs a reason for Stuck and tells the person who handed the task out", async () => {
    const projectId = await projectWithBen()
    const { id } = await createTask(anna, newTask(projectId, { assigneeUserId: ben.id }), database)

    await expect(
      setTaskStatus(ben, { taskId: id, status: "stuck", stuckReason: null }, database)
    ).rejects.toThrow(PROJECT_ERRORS.stuckNeedsReason)
    await setTaskStatus(ben, { taskId: id, status: "stuck", stuckReason: "Waiting on copy" }, database)
    expect((await noticesFor(anna.id)).map((n) => n.kind)).toEqual(["task_stuck"])

    await setTaskStatus(ben, { taskId: id, status: "doing", stuckReason: null }, database)
    const [row] = await database.select().from(projectTasks).where(eq(projectTasks.id, id))
    expect(row.stuckReason).toBeNull()
  })

  it("keeps a removed person's name on their tasks and takes them off", async () => {
    const projectId = await projectWithBen()
    const { id } = await createTask(anna, newTask(projectId, { assigneeUserId: ben.id }), database)
    await removeProjectMember(anna.id, projectId, ben.id, database)
    let detail = await loadTaskDetail(anna.id, id, database)
    expect(detail.task).toMatchObject({ assignee: null, formerAssigneeName: "Ben" })

    await addProjectMember(anna.id, projectId, ben.id, database)
    await assignTask(anna, { taskId: id, assigneeUserId: ben.id }, database)
    await removeTeamMember(anna.id, ben.id, database)
    detail = await loadTaskDetail(anna.id, id, database)
    expect(detail.task).toMatchObject({ assignee: null, formerAssigneeName: "Ben" })
    expect((await loadProjectsPage(ben.id, database)).team).toBeNull()
  })
})

describe("notices after someone leaves", () => {
  it("never sends a task's title to someone no longer on the project", async () => {
    await teamOfThree()
    const { id: projectId } = await createProject(ben.id, { name: "Site", color: "blue", description: "" }, database)
    await addProjectMember(ben.id, projectId, carla.id, database)
    // Ben hands Carla a task, then Ben leaves the team.
    const { id } = await createTask(ben, newTask(projectId, { assigneeUserId: carla.id }), database)
    await acceptTask(carla, id, database)
    await leaveTeam(ben.id, database)

    await setTaskStatus(carla, { taskId: id, status: "stuck", stuckReason: "Blocked" }, database)
    await addComment(carla, { taskId: id, body: "Any news?" }, database)
    expect(await noticesFor(ben.id)).toEqual([])
  })
})

describe("left menu", () => {
  it("adds Project's section to each menu once and leaves a removed one removed", async () => {
    const workspace = await insertWorkspace(database, {
      settings: { sections: [{ id: "section-account", title: "Account", entries: [] }] },
    })
    await addProjectNavigation(database)

    const [settings] = await database.select().from(customShellSettings)
    const members = (settings.settings as { memberSections: { id: string }[] }).memberSections
    expect(members.map((section) => section.id)).toEqual([
      PROJECT_NAV_SECTION_ID,
      "section-member-home",
      "section-member-updates",
    ])
    const sectionsOf = async () => {
      const [row] = await database
        .select()
        .from(customShellWorkspaces)
        .where(eq(customShellWorkspaces.id, workspace.id))
      return (row.settings as { sections: { id: string }[] }).sections.map((s) => s.id)
    }
    expect(await sectionsOf()).toEqual([PROJECT_NAV_SECTION_ID, "section-account"])

    // An admin removes the section; the next pass must not bring it back.
    await database
      .update(customShellWorkspaces)
      .set({ settings: { sections: [{ id: "section-account", title: "Account", entries: [] }] } })
      .where(eq(customShellWorkspaces.id, workspace.id))
    await addProjectNavigation(database)
    expect(await sectionsOf()).toEqual(["section-account"])
  })
})

function newTask(
  projectId: string,
  overrides: Partial<Parameters<typeof createTask>[1]> = {}
): Parameters<typeof createTask>[1] {
  return {
    projectId,
    title: "Write the brief",
    notes: "",
    assigneeUserId: null,
    dueDate: null,
    steps: [],
    ...overrides,
  }
}
