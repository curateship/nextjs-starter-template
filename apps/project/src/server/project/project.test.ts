import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { JOINS_PER_LINK_PER_DAY } from "@/lib/project/rules"
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
import { projectNavigationAdded, projectNoticeLinks, projectTasks } from "@/server/project/schema"
import { sendMessage } from "@/server/project/task-chat"
import {
  acceptTask,
  assignTask,
  createTask,
  handBackTask,
  loadMyWork,
  loadTaskDetail,
  setTaskStatus,
} from "@/server/project/tasks"
import {
  handOverAllTasks,
  joinTeamByLink,
  loadJoinOffer,
  loadNeedsAttention,
  loadWorkload,
  makeJoinLink,
  setMemberTitle,
} from "@/server/project/team-running"
import {
  changeMemberRole,
  createTeam,
  leaveTeam,
  loadTeamDashboard,
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
    // The page the link opens is under /projects; a bare /invite/ was a 404.
    expect(sent.link).toContain("/projects/invite/")
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
    await sendMessage(carla, { chat: { taskId: id }, body: "Any news?", replyToId: null }, database)
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

  it("adds Task types after Team to a menu that already had the section, once", async () => {
    const workEntries = async () => {
      const [settings] = await database.select().from(customShellSettings)
      const sections = (settings.settings as { memberSections: { id: string; entries: { id: string }[] }[] })
        .memberSections
      return sections.find((section) => section.id === PROJECT_NAV_SECTION_ID)!.entries.map((e) => e.id)
    }
    await addProjectNavigation(database)
    const fresh = await workEntries()
    expect(fresh.slice(fresh.indexOf("item-project-team"))).toEqual([
      "item-project-team",
      "item-project-task-types",
    ])

    // A menu from before Task types existed: the section without the link, and no marker for it.
    const [settings] = await database.select().from(customShellSettings)
    const old = settings.settings as { memberSections: { id: string; entries: { id: string }[] }[] }
    const before = old.memberSections.map((section) =>
      section.id === PROJECT_NAV_SECTION_ID
        ? { ...section, entries: section.entries.filter((e) => e.id !== "item-project-task-types") }
        : section
    )
    await database
      .update(customShellSettings)
      .set({ settings: { ...old, memberSections: before } })
      .where(eq(customShellSettings.key, "default"))
    await database.delete(projectNavigationAdded).where(eq(projectNavigationAdded.scope, "members:task-types"))
    await addProjectNavigation(database)
    expect(await workEntries()).toEqual(fresh)

    // Removed again by an admin, it stays removed.
    await database
      .update(customShellSettings)
      .set({ settings: { ...old, memberSections: before } })
      .where(eq(customShellSettings.key, "default"))
    await addProjectNavigation(database)
    expect(await workEntries()).not.toContain("item-project-task-types")
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

describe("running the team", () => {
  let website: string
  let brand: string
  let dave: CustomShellUser

  /** Anna owns the team; Ben and Carla are members, on Website; only Ben is on Brand. */
  beforeEach(async () => {
    await createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)
    for (const person of [ben, carla]) {
      const sent = await createInvite(actor(anna), { email: person.email, role: "member" }, database)
      await acceptInvite(person, sent.inviteId, database)
    }
    website = (await createProject(anna.id, { name: "Website", color: "blue", description: "" }, database)).id
    brand = (await createProject(anna.id, { name: "Brand", color: "pink", description: "" }, database)).id
    await addProjectMember(anna.id, website, ben.id, database)
    await addProjectMember(anna.id, website, carla.id, database)
    await addProjectMember(anna.id, brand, ben.id, database)
    dave = await insertUser(database, { name: "Dave", email: "dave@example.test" })
  })

  async function taskFor(
    person: CustomShellUser | null,
    title: string,
    projectId = website,
    dueDate: string | null = null
  ) {
    return (
      await createTask(
        actor(anna),
        { projectId, title, notes: "", assigneeUserId: person?.id ?? null, dueDate, steps: [] },
        database
      )
    ).id
  }

  it("lists stuck, unanswered, dragging and overdue tasks for the owner, and drops one once it's fixed", async () => {
    const stuck = await taskFor(ben, "Redirects")
    await acceptTask(actor(ben), stuck, database)
    await setTaskStatus(actor(ben), { taskId: stuck, status: "stuck", stuckReason: "No page list" }, database)
    // Listed the same day it is marked Stuck.
    expect((await loadNeedsAttention(anna.id, database)).find((r) => r.taskId === stuck)).toMatchObject({
      kind: "stuck",
      howLong: "Stuck since today",
    })
    const waiting = await taskFor(carla, "Copy for the home page")
    const late = await taskFor(ben, "Logo files", website, "2020-01-01")
    await acceptTask(actor(ben), late, database)

    const at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    const rows = await loadNeedsAttention(anna.id, database, at)
    const kinds = (taskId: string) => rows.filter((r) => r.taskId === taskId).map((r) => r.kind)
    expect(kinds(stuck)).toEqual(["stuck"])
    expect(kinds(late)).toEqual(["overdue"])
    expect(kinds(waiting)).toEqual(["not_accepted"])
    expect(rows.find((r) => r.taskId === stuck)).toMatchObject({ personName: "Ben", projectName: "Website" })

    await setTaskStatus(actor(ben), { taskId: stuck, status: "doing", stuckReason: null }, database)
    expect((await loadNeedsAttention(anna.id, database, at)).some((r) => r.taskId === stuck)).toBe(false)
    await expect(loadNeedsAttention(ben.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
  })

  it("counts each person's workload, from only the projects the viewer can see", async () => {
    await taskFor(ben, "Website one")
    const doing = await taskFor(ben, "Website two")
    await setTaskStatus(actor(ben), { taskId: doing, status: "doing", stuckReason: null }, database)
    await taskFor(ben, "Brand only", brand)

    const owner = await loadWorkload(anna.id, database)
    const benRow = owner.find((r) => r.person.id === ben.id)!
    expect(benRow.counts).toMatchObject({ open: 3, doing: 1, stuck: 0 })
    const fromDb = await database.select().from(projectTasks).where(eq(projectTasks.assigneeUserId, ben.id))
    expect(benRow.counts.open).toBe(fromDb.filter((t) => t.status !== "done").length)

    // Carla isn't on Brand, so Ben's Brand task isn't counted for her.
    const member = await loadWorkload(carla.id, database)
    expect(member.find((r) => r.person.id === ben.id)!.counts.open).toBe(2)
    expect(member.find((r) => r.person.id === ben.id)!.tasks.open.map((t) => t.title)).not.toContain("Brand only")
  })

  it("hands all of one person's open tasks on, with one notice, and leaves the rest with nobody", async () => {
    const ids = [await taskFor(ben, "One"), await taskFor(ben, "Two"), await taskFor(ben, "Three")]
    const brandTask = await taskFor(ben, "Brand job", brand)
    const done = await taskFor(ben, "Finished")
    await setTaskStatus(actor(ben), { taskId: done, status: "done", stuckReason: null }, database)

    const outcome = await handOverAllTasks(actor(anna), { fromUserId: ben.id, toUserId: carla.id }, database)
    expect(outcome.handed.map((t) => t.title).sort()).toEqual(["One", "Three", "Two"])
    expect(outcome.left).toEqual([{ id: brandTask, title: "Brand job", projectName: "Brand" }])
    for (const id of ids) {
      const detail = await loadTaskDetail(anna.id, id, database)
      expect(detail.task.assignee?.id).toBe(carla.id)
      expect(detail.task.waiting).toBe(true)
      expect(detail.history.filter((e) => e.kind === "handed_over").at(-1)).toMatchObject({ targetName: "Carla" })
    }
    expect((await loadTaskDetail(anna.id, brandTask, database)).task).toMatchObject({
      assignee: null,
      formerAssigneeName: "Ben",
    })
    expect((await loadTaskDetail(anna.id, done, database)).task.assignee?.id).toBe(ben.id)

    const notices = await database
      .select({ message: customShellNotifications.message, kind: projectNoticeLinks.kind })
      .from(customShellNotifications)
      .innerJoin(projectNoticeLinks, eq(projectNoticeLinks.noticeId, customShellNotifications.id))
      .where(eq(customShellNotifications.recipientUserId, carla.id))
    expect(notices).toEqual([{ message: "Anna gave you 3 tasks", kind: "tasks_handed" }])
    await expect(
      handOverAllTasks(actor(ben), { fromUserId: carla.id, toUserId: ben.id }, database)
    ).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
  })

  it("lets someone with no team join through the link, and refuses a reset link or someone on a team", async () => {
    const { link } = await makeJoinLink(anna.id, database)
    const token = decodeURIComponent(link.split("/projects/join/")[1])
    expect(await loadJoinOffer(dave.id, token, database)).toEqual({ teamName: "Acme", blocker: null })
    expect((await loadJoinOffer(ben.id, token, database))?.blocker).toBe("already-on-team")
    await expect(joinTeamByLink(ben, token, database)).rejects.toThrow(PROJECT_ERRORS.alreadyOnTeam)

    await joinTeamByLink(dave, token, database)
    expect((await loadTeamDashboard(anna.id, database))?.members.map((m) => m.name)).toContain("Dave")
    const told = await database
      .select({ message: customShellNotifications.message })
      .from(customShellNotifications)
      .where(eq(customShellNotifications.recipientUserId, anna.id))
    expect(told.map((n) => n.message)).toContain("Dave joined the team through the link")

    const erin = await insertUser(database, { name: "Erin", email: "erin@example.test" })
    await makeJoinLink(anna.id, database)
    expect(await loadJoinOffer(erin.id, token, database)).toBeNull()
    await expect(joinTeamByLink(erin, token, database)).rejects.toThrow(PROJECT_ERRORS.joinLinkNotFound)
    await expect(makeJoinLink(ben.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
  })

  it("caps joins through one link per day", async () => {
    const { link } = await makeJoinLink(anna.id, database)
    const token = decodeURIComponent(link.split("/projects/join/")[1])
    for (let i = 0; i < JOINS_PER_LINK_PER_DAY; i++) {
      const person = await insertUser(database, { name: `Joiner ${i}`, email: `joiner${i}@example.test` })
      await joinTeamByLink(person, token, database)
    }
    const late = await insertUser(database, { name: "Late", email: "late@example.test" })
    await expect(joinTeamByLink(late, token, database)).rejects.toThrow(PROJECT_ERRORS.joinLinkBusy)
  })

  it("lets each person set their own job title, and the owner set anyone's", async () => {
    await setMemberTitle(ben.id, { title: "Copywriter" }, database)
    await setMemberTitle(anna.id, { userId: carla.id, title: "Designer" }, database)
    await expect(setMemberTitle(ben.id, { userId: carla.id, title: "Intern" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
    const members = (await loadTeamDashboard(anna.id, database))!.members
    expect(members.find((m) => m.userId === ben.id)?.title).toBe("Copywriter")
    expect(members.find((m) => m.userId === carla.id)?.title).toBe("Designer")
    const page = await loadProjectPage(ben.id, website, database)
    expect(page.members.find((m) => m.userId === carla.id)?.title).toBe("Designer")
  })
})
