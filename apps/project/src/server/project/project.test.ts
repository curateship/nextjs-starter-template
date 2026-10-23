import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { JOINS_PER_LINK_PER_DAY } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { setEmailProviderFactoryForTests } from "@/server/email/provider"
import { findMembership, inTeam } from "@/server/project/access"
import {
  EMPLOYEE_ROLE,
  INVITE_LIMITS,
  createInvite,
  createInvites,
  resendInvite,
} from "@/server/project/invites"
import { PROJECT_NAV_SECTION_ID } from "@/lib/project/menu"
import { addProjectNavigation } from "@/server/project/navigation"
import { loadMyDashboard, setMyStatusOrder } from "@/server/project/my-dashboard"
import {
  addProjectMember,
  loadProjectPage,
  loadProjectsPage,
  removeProjectMember,
  setProjectArchived,
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
  createTeam,
  loadTeamDashboard,
  removeTeamMember,
  type TeamSummary,
} from "@/server/project/teams"
import { insertEmployee, insertSiteAdmin, projectFor, startTeam } from "@/server/project/test-people"
import {
  customShellNotifications,
  customShellSettings,
  customShellUsers,
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

/**
 * The site admin makes a team; Anna, Ben and Carla are its employees. Returns
 * the team and the site admin, who runs it without being on it.
 */
async function teamOfThree(): Promise<{ team: TeamSummary; admin: CustomShellUser }> {
  return startTeam(database, [anna, ben, carla])
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

async function accountOf(userId: string) {
  const [row] = await database.select().from(customShellUsers).where(eq(customShellUsers.id, userId))
  return row
}

describe("teams and invites", () => {
  it("lets only the site admin make a team, never puts them on it, and answers for the team the page names", async () => {
    await expect(createTeam(anna.id, { name: "Acme", timeZone: "UTC" }, database)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
    const admin = await insertSiteAdmin(database)
    const acme = await createTeam(admin.id, { name: "Acme", timeZone: "UTC" }, database)
    // On no team, so nothing answers until a page names one.
    expect(await findMembership(admin.id, database)).toBeNull()
    expect(await findMembership(admin.id, database, acme.id)).toEqual({
      teamId: acme.id,
      userId: admin.id,
      role: "owner",
      siteAdmin: true,
    })
    expect((await inTeam(acme.id, () => loadTeamDashboard(admin.id, database)))?.members).toEqual([])
    await expect(loadTeamDashboard(admin.id, database)).resolves.toBeNull()

    // The site admin runs every team, so a second one is allowed, and each answers for itself.
    const second = await createTeam(admin.id, { name: "Second", timeZone: "UTC" }, database)
    expect((await inTeam(second.id, () => loadTeamDashboard(admin.id, database)))?.team.name).toBe("Second")
    expect((await inTeam(acme.id, () => loadTeamDashboard(admin.id, database)))?.team.name).toBe("Acme")
  })

  it("makes the employee and puts them on the team at once, saying it wasn't emailed when no email key is set", async () => {
    const { team, admin } = await teamOfThree()
    await inTeam(team.id, async () => {
      const sent = await createInvite(actor(admin), { email: " Dave.Stone@Example.test " }, database)
      expect(sent.emailed).toBe(false)

      const dave = await accountOf(sent.userId)
      expect(dave).toMatchObject({ email: "dave.stone@example.test", name: "Dave Stone", role: EMPLOYEE_ROLE })
      expect(dave.passwordHash).toBeNull()
      expect(await findMembership(dave.id, database)).toEqual({
        teamId: team.id,
        userId: dave.id,
        role: "member",
        siteAdmin: false,
      })
      // Listed as invited until they set a password from their email.
      const members = (await loadTeamDashboard(admin.id, database))!.members
      expect(members.find((m) => m.userId === dave.id)).toMatchObject({ name: "Dave Stone", invited: true })
      expect(members.find((m) => m.userId === ben.id)?.invited).toBe(false)

      // A name given with the invite is used instead of one made from the address.
      const erin = await createInvite(actor(admin), { email: "e.k@example.test", name: "Erin King" }, database)
      expect((await accountOf(erin.userId)).name).toBe("Erin King")
    })
  })

  it("refuses an address on a team and an account that isn't an employee, and puts an employee with no team on the team", async () => {
    const { team, admin } = await teamOfThree()
    await inTeam(team.id, async () => {
      await expect(createInvite(actor(admin), { email: "BEN@example.test" }, database)).rejects.toThrow(
        PROJECT_ERRORS.emailOnATeam
      )
      const olga = await insertEmployee(database, { name: "Olga", email: "olga@example.test" })
      await startTeam(database, [olga], { name: "Other" })
      await expect(createInvite(actor(admin), { email: olga.email }, database)).rejects.toThrow(
        PROJECT_ERRORS.emailOnATeam
      )
      // A plain member or another admin is never moved onto a team by an invite.
      const member = await insertUser(database, { name: "Max", email: "max@example.test" })
      await expect(createInvite(actor(admin), { email: member.email }, database)).rejects.toThrow(
        PROJECT_ERRORS.emailNotAnEmployee
      )
      const otherAdmin = await insertSiteAdmin(database, { email: "boss@example.test" })
      await expect(createInvite(actor(admin), { email: otherAdmin.email }, database)).rejects.toThrow(
        PROJECT_ERRORS.emailNotAnEmployee
      )

      const free = await insertEmployee(database, { name: "Finn", email: "finn@example.test" })
      const sent = await createInvite(actor(admin), { email: free.email }, database)
      expect(sent.userId).toBe(free.id)
      expect((await findMembership(free.id, database))?.teamId).toBe(team.id)
    })
  })

  it("sends several at once and says what happened to each address", async () => {
    const { team, admin } = await teamOfThree()
    await inTeam(team.id, async () => {
      await insertUser(database, { name: "Max", email: "max@example.test" })
      const outcomes = await createInvites(
        actor(admin),
        { emails: ["new@example.test", "ben@example.test", "max@example.test", "not an email", "NEW@example.test"] },
        database
      )
      // The same address twice is sent once.
      expect(outcomes.map((o) => [o.email, o.result])).toEqual([
        ["new@example.test", "sent"],
        ["ben@example.test", "on_team"],
        ["max@example.test", "not_an_employee"],
        ["not an email", "not_an_email"],
      ])
      const [first] = outcomes
      expect(first.result === "sent" && (await accountOf(first.sent.userId)).role).toBe(EMPLOYEE_ROLE)
    })
  })

  it("resends the set-password link only to someone invited who hasn't set one, and caps how often one address is emailed", async () => {
    const { team, admin } = await teamOfThree()
    await inTeam(team.id, async () => {
      const first = await createInvite(actor(admin), { email: "target@example.test" }, database)
      for (let sent = 1; sent < INVITE_LIMITS.perAddress.maxAttempts; sent++) {
        expect((await resendInvite(actor(admin), first.userId, database)).userId).toBe(first.userId)
      }
      await expect(resendInvite(actor(admin), first.userId, database)).rejects.toThrow("RATE_LIMITED")

      // Ben has set his password, so there is no invite to send again.
      await expect(resendInvite(actor(admin), ben.id, database)).rejects.toThrow(PROJECT_ERRORS.alreadySignedIn)
      const stranger = await insertEmployee(database, { passwordHash: null })
      await expect(resendInvite(actor(admin), stranger.id, database)).rejects.toThrow(
        PROJECT_ERRORS.personNotOnTeam
      )
    })
  })

  it("refuses invites and resends from employees", async () => {
    const { team, admin } = await teamOfThree()
    await inTeam(team.id, async () => {
      const sent = await createInvite(actor(admin), { email: "new@example.test" }, database)
      for (const person of [anna, ben]) {
        await expect(createInvite(actor(person), { email: "other@example.test" }, database)).rejects.toThrow(
          PROJECT_ERRORS.notRunningTeam
        )
        await expect(createInvites(actor(person), { emails: ["other@example.test"] }, database)).rejects.toThrow(
          PROJECT_ERRORS.notRunningTeam
        )
        await expect(resendInvite(actor(person), sent.userId, database)).rejects.toThrow(
          PROJECT_ERRORS.notRunningTeam
        )
      }
    })
  })
})

describe("who sees a project", () => {
  it("shows a project only to its members and the site admin", async () => {
    const { admin } = await teamOfThree()
    const { id } = await projectFor(admin, ben.id, { name: "Site", color: "blue", description: "" }, database)

    expect((await loadProjectsPage(ben.id, database)).projects.map((p) => p.id)).toEqual([id])
    expect((await loadProjectsPage(carla.id, database)).projects).toEqual([])
    expect((await loadProjectsPage(anna.id, database)).projects).toEqual([])
    // The site admin sees every project without being added.
    expect((await loadProjectsPage(admin.id, database)).projects.map((p) => p.id)).toEqual([id])
    await expect(loadProjectPage(carla.id, id, database)).rejects.toThrow(
      PROJECT_ERRORS.projectNotFound
    )
  })

  it("refuses someone from another team, whatever id they guess", async () => {
    const { admin } = await teamOfThree()
    const outsider = await insertUser(database, { name: "Olga", email: "olga@example.test" })
    await startTeam(database, [outsider], { name: "Rival" })
    const { id } = await projectFor(admin, anna.id, { name: "Site", color: "blue", description: "" }, database)
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
    const { admin } = await teamOfThree()
    const { id } = await projectFor(admin, anna.id, { name: "Site", color: "blue", description: "" }, database)
    await expect(
      createTask(anna, newTask(id, { assigneeUserId: carla.id }), database)
    ).rejects.toThrow(PROJECT_ERRORS.notProjectMember)
  })
})

describe("handing tasks over", () => {
  let admin: CustomShellUser
  let team: TeamSummary

  /** Anna makes Site and is on it; the site admin adds Ben. */
  async function projectWithBen() {
    ;({ team, admin } = await teamOfThree())
    const { id } = await projectFor(admin, anna.id, { name: "Site", color: "blue", description: "" }, database)
    await addProjectMember(admin.id, id, ben.id, database)
    return id
  }

  it("keeps my own Board column order on My dashboard, which nobody else gets", async () => {
    await projectWithBen()
    await setMyStatusOrder(ben.id, ["doing", "todo", "stuck", "done"], database)
    expect((await loadMyDashboard(ben.id, database)).statusOrder).toEqual(["doing", "todo", "stuck", "done"])
    expect((await loadMyDashboard(anna.id, database)).statusOrder).toEqual(["todo", "doing", "done", "stuck"])
  })

  it("takes an archived project's tasks off My dashboard, and brings them back with it", async () => {
    const projectId = await projectWithBen()
    const { id } = await createTask(anna, newTask(projectId, { assigneeUserId: ben.id }), database)
    expect((await loadMyWork(ben.id, database)).map((card) => card.id)).toEqual([id])
    await setProjectArchived(admin.id, projectId, true, database)
    expect(await loadMyWork(ben.id, database)).toEqual([])
    await setProjectArchived(admin.id, projectId, false, database)
    expect((await loadMyWork(ben.id, database)).map((card) => card.id)).toEqual([id])
  })

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
    await inTeam(team.id, async () => {
      const { id } = await createTask(anna, newTask(projectId, { assigneeUserId: ben.id }), database)
      await removeProjectMember(admin.id, projectId, ben.id, database)
      let detail = await loadTaskDetail(anna.id, id, database)
      expect(detail.task).toMatchObject({ assignee: null, formerAssigneeName: "Ben" })

      await addProjectMember(admin.id, projectId, ben.id, database)
      await assignTask(anna, { taskId: id, assigneeUserId: ben.id }, database)
      await expect(removeTeamMember(anna.id, ben.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
      await removeTeamMember(admin.id, ben.id, database)
      detail = await loadTaskDetail(anna.id, id, database)
      expect(detail.task).toMatchObject({ assignee: null, formerAssigneeName: "Ben" })
      expect((await loadProjectsPage(ben.id, database)).team).toBeNull()
    })
  })
})

describe("notices after someone leaves", () => {
  it("never sends a task's title to someone no longer on the project", async () => {
    const { team, admin } = await teamOfThree()
    await inTeam(team.id, async () => {
      const { id: projectId } = await projectFor(admin, ben.id, { name: "Site", color: "blue", description: "" }, database)
      await addProjectMember(admin.id, projectId, carla.id, database)
      // Ben hands Carla a task, then the site admin takes Ben off the team.
      const { id } = await createTask(ben, newTask(projectId, { assigneeUserId: carla.id }), database)
      await acceptTask(carla, id, database)
      await removeTeamMember(admin.id, ben.id, database)

      await setTaskStatus(carla, { taskId: id, status: "stuck", stuckReason: "Blocked" }, database)
      await sendMessage(carla, { chat: { taskId: id }, body: "Any news?", replyToId: null }, database)
      expect(await noticesFor(ben.id)).toEqual([])
    })
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

  it("puts My dashboard first in the admins' menus, back where an older pass took it out", async () => {
    const workspace = await insertWorkspace(database, { settings: { sections: [] } })
    await addProjectNavigation(database)
    const adminEntries = async () => {
      const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
      const admins = (row.settings as { sections: { id: string; entries: { id: string }[] }[] }).sections
      return admins.find((section) => section.id === PROJECT_NAV_SECTION_ID)!.entries.map((e) => e.id)
    }
    const fresh = ["item-project-dashboard", "item-project-projects", "item-project-team", "item-project-task-types"]
    expect(await adminEntries()).toEqual(fresh)

    // A menu from 16 Oct 2026, when My dashboard left the admins' menus.
    const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    const settings16 = row.settings as { sections: { id: string; entries: { id: string }[] }[] }
    await database
      .update(customShellWorkspaces)
      .set({
        settings: {
          ...settings16,
          sections: settings16.sections.map((section) =>
            section.id === PROJECT_NAV_SECTION_ID
              ? { ...section, entries: section.entries.filter((e) => e.id !== "item-project-dashboard") }
              : section
          ),
        },
      })
      .where(eq(customShellWorkspaces.id, workspace.id))
    await database
      .delete(projectNavigationAdded)
      .where(eq(projectNavigationAdded.scope, `workspace:${workspace.id}:admin-my-dashboard`))
    await addProjectNavigation(database)
    expect(await adminEntries()).toEqual(fresh)
    const [settings] = await database.select().from(customShellSettings)
    const members = (settings.settings as { memberSections: { id: string; entries: { id: string }[] }[] })
      .memberSections
    expect(members.find((section) => section.id === PROJECT_NAV_SECTION_ID)!.entries.map((e) => e.id)).toContain(
      "item-project-dashboard"
    )
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
  let team: TeamSummary
  let admin: CustomShellUser

  /**
   * The site admin runs the team. Anna makes Website and Brand and is on
   * both; Ben and Carla are on Website; only Ben is on Brand.
   */
  beforeEach(async () => {
    ;({ team, admin } = await teamOfThree())
    website = (await projectFor(admin, anna.id, { name: "Website", color: "blue", description: "" }, database)).id
    brand = (await projectFor(admin, anna.id, { name: "Brand", color: "pink", description: "" }, database)).id
    await addProjectMember(admin.id, website, ben.id, database)
    await addProjectMember(admin.id, website, carla.id, database)
    await addProjectMember(admin.id, brand, ben.id, database)
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

  it("lists stuck, unanswered, dragging and overdue tasks for the site admin, and drops one once it's fixed", async () => {
    await inTeam(team.id, async () => {
      const stuck = await taskFor(ben, "Redirects")
      await acceptTask(actor(ben), stuck, database)
      await setTaskStatus(actor(ben), { taskId: stuck, status: "stuck", stuckReason: "No page list" }, database)
      // Listed the same day it is marked Stuck.
      expect((await loadNeedsAttention(admin.id, database)).find((r) => r.taskId === stuck)).toMatchObject({
        kind: "stuck",
        howLong: "Stuck since today",
      })
      const waiting = await taskFor(carla, "Copy for the home page")
      const late = await taskFor(ben, "Logo files", website, "2020-01-01")
      await acceptTask(actor(ben), late, database)

      const at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      const rows = await loadNeedsAttention(admin.id, database, at)
      const kinds = (taskId: string) => rows.filter((r) => r.taskId === taskId).map((r) => r.kind)
      expect(kinds(stuck)).toEqual(["stuck"])
      expect(kinds(late)).toEqual(["overdue"])
      expect(kinds(waiting)).toEqual(["not_accepted"])
      expect(rows.find((r) => r.taskId === stuck)).toMatchObject({ personName: "Ben", projectName: "Website" })

      await setTaskStatus(actor(ben), { taskId: stuck, status: "doing", stuckReason: null }, database)
      expect((await loadNeedsAttention(admin.id, database, at)).some((r) => r.taskId === stuck)).toBe(false)
      await expect(loadNeedsAttention(ben.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
      await expect(loadNeedsAttention(anna.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    })
  })

  it("counts each person's workload, from only the projects the viewer can see", async () => {
    await inTeam(team.id, async () => {
      await taskFor(ben, "Website one")
      const doing = await taskFor(ben, "Website two")
      await setTaskStatus(actor(ben), { taskId: doing, status: "doing", stuckReason: null }, database)
      await taskFor(ben, "Brand only", brand)

      const siteAdmin = await loadWorkload(admin.id, database)
      const benRow = siteAdmin.find((r) => r.person.id === ben.id)!
      expect(benRow.counts).toMatchObject({ open: 3, doing: 1, stuck: 0 })
      const fromDb = await database.select().from(projectTasks).where(eq(projectTasks.assigneeUserId, ben.id))
      expect(benRow.counts.open).toBe(fromDb.filter((t) => t.status !== "done").length)

      // Carla isn't on Brand, so Ben's Brand task isn't counted for her.
      const member = await loadWorkload(carla.id, database)
      expect(member.find((r) => r.person.id === ben.id)!.counts.open).toBe(2)
      expect(member.find((r) => r.person.id === ben.id)!.tasks.open.map((t) => t.title)).not.toContain("Brand only")
    })
  })

  it("hands all of one person's open tasks on, with one notice, and leaves the rest with nobody", async () => {
    await inTeam(team.id, async () => {
      const ids = [await taskFor(ben, "One"), await taskFor(ben, "Two"), await taskFor(ben, "Three")]
      const brandTask = await taskFor(ben, "Brand job", brand)
      const done = await taskFor(ben, "Finished")
      await setTaskStatus(actor(ben), { taskId: done, status: "done", stuckReason: null }, database)

      const outcome = await handOverAllTasks(actor(admin), { fromUserId: ben.id, toUserId: carla.id }, database)
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
      expect(notices).toEqual([{ message: "Tyler gave you 3 tasks", kind: "tasks_handed" }])
      for (const person of [anna, ben]) {
        await expect(
          handOverAllTasks(actor(person), { fromUserId: carla.id, toUserId: ben.id }, database)
        ).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
      }
    })
  })

  it("lets someone with no account join through the link, signed out, and refuses an address that has one or a reset link", async () => {
    await inTeam(team.id, async () => {
      const { link } = await makeJoinLink(admin.id, database)
      expect(link).toMatch(/\/join\/[^/]+$/)
      const token = decodeURIComponent(link.split("/join/")[1])
      expect(await loadJoinOffer(token, database)).toEqual({ teamName: "Acme", blocker: null })

      // An address with an account can't be moved onto a team by a link.
      await expect(joinTeamByLink({ name: "Ben", email: "BEN@example.test" }, token, database)).rejects.toThrow(
        PROJECT_ERRORS.joinEmailTaken
      )
      const max = await insertUser(database, { name: "Max", email: "max@example.test" })
      await expect(joinTeamByLink({ name: "Max", email: max.email }, token, database)).rejects.toThrow(
        PROJECT_ERRORS.joinEmailTaken
      )
      await expect(joinTeamByLink({ name: " ", email: "dave@example.test" }, token, database)).rejects.toThrow(
        PROJECT_ERRORS.joinNeedsName
      )

      expect(await joinTeamByLink({ name: "Dave", email: "Dave@Example.test" }, token, database)).toEqual({
        emailed: false,
      })
      const dave = (await loadTeamDashboard(admin.id, database))!.members.find((m) => m.name === "Dave")!
      expect(dave).toMatchObject({ email: "dave@example.test", invited: true })
      expect((await accountOf(dave.userId)).role).toBe(EMPLOYEE_ROLE)
      // The site admin hears about it, with a link that opens this team first.
      expect(await noticesFor(admin.id)).toContainEqual(
        expect.objectContaining({
          message: "Dave joined the team through the link",
          kind: "team_joined",
          href: `/teams/${team.id}/members`,
        })
      )
      expect((await noticesFor(anna.id)).map((n) => n.kind)).not.toContain("team_joined")

      // A fresh link stops the old one working.
      await makeJoinLink(admin.id, database)
      expect(await loadJoinOffer(token, database)).toBeNull()
      await expect(joinTeamByLink({ name: "Erin", email: "erin@example.test" }, token, database)).rejects.toThrow(
        PROJECT_ERRORS.joinLinkNotFound
      )
      await expect(makeJoinLink(ben.id, database)).rejects.toThrow(PROJECT_ERRORS.notRunningTeam)
    })
  })

  it("caps joins through one link per day", async () => {
    await inTeam(team.id, async () => {
      const { link } = await makeJoinLink(admin.id, database)
      const token = decodeURIComponent(link.split("/join/")[1])
      for (let i = 0; i < JOINS_PER_LINK_PER_DAY; i++) {
        await joinTeamByLink({ name: `Joiner ${i}`, email: `joiner${i}@example.test` }, token, database)
      }
      await expect(joinTeamByLink({ name: "Late", email: "late@example.test" }, token, database)).rejects.toThrow(
        PROJECT_ERRORS.joinLinkBusy
      )
    })
  })

  it("lets each person set their own job title, and the site admin set anyone's", async () => {
    await inTeam(team.id, async () => {
      await setMemberTitle(ben.id, { title: "Copywriter" }, database)
      await setMemberTitle(admin.id, { userId: carla.id, title: "Designer" }, database)
      for (const person of [anna, ben]) {
        await expect(setMemberTitle(person.id, { userId: carla.id, title: "Intern" }, database)).rejects.toThrow(
          PROJECT_ERRORS.notRunningTeam
        )
      }
      const members = (await loadTeamDashboard(anna.id, database))!.members
      expect(members.find((m) => m.userId === ben.id)?.title).toBe("Copywriter")
      expect(members.find((m) => m.userId === carla.id)?.title).toBe("Designer")
      const page = await loadProjectPage(ben.id, website, database)
      expect(page.members.find((m) => m.userId === carla.id)?.title).toBe("Designer")
    })
  })
})
