import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm"

import { getProjectErrorMessage, PROJECT_ERRORS } from "@/lib/project/errors"
import {
  CLOSED_TASK_STATUSES,
  LIMITS,
  PERSONAL_PROJECT_ID,
  PERSONAL_PROJECT_NAME,
  type ProjectColor,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  isProjectMember,
  isSiteAdmin,
  requireOpenProject,
  requireTaskAccess,
  visibleProjectsWhere,
  type Membership,
  type ProjectDb,
  type TaskRow,
} from "@/server/project/access"
import {
  projectProjectMembers,
  projectProjects,
  projectTasks,
  projectTeams,
} from "@/server/project/schema"
import { holidayOn } from "@/server/project/holidays"
import { isAdminSpace, requireSharedProject, resolveProjectId } from "@/server/project/personal"
import { nextTaskPosition } from "@/server/project/task-order"
import { recordTaskEvent } from "@/server/project/task-history"
import { awayOn } from "@/server/project/time-off"
import {
  assignTask,
  createTask,
  deleteTask,
  setTaskStatus,
  updateTask,
  type Actor,
} from "@/server/project/tasks"
import { clearAssignee } from "@/server/project/teams"
import { customShellUsers } from "@/server/schema"
import { storedNotesForCopy } from "@/lib/project/notes"

/**
 * Faster ways to make and change tasks: many from a pasted list, a copy, a
 * move to another project, and one change over many rows. Every hand-over
 * still goes through `assignTask` or `createTask`, so it writes its history
 * row and sends "gave you a task" as a single one does.
 */

/** Pasted meeting notes become tasks: one per line, at most 50 at once. */
export async function createTasksFromLines(
  actor: Actor,
  input: {
    projectId: string
    titles: string[]
    assigneeUserId: string | null
    dueDate: string | null
    handoverNote?: string | null
  },
  database = db
): Promise<{ ids: string[] }> {
  if (input.titles.length > LIMITS.tasksPerPaste) throw new Error(PROJECT_ERRORS.tooManyLines)
  return database.transaction(async (tx) => {
    const ids: string[] = []
    for (const title of input.titles) {
      const { id } = await createTask(
        actor,
        {
          projectId: input.projectId,
          title,
          notes: "",
          assigneeUserId: input.assigneeUserId,
          dueDate: input.dueDate,
          handoverNote: input.handoverNote,
        },
        tx
      )
      ids.push(id)
    }
    return { ids }
  })
}

/**
 * "<title> (copy)" in the same project, with the notes and priority, To do
 * and nobody assigned. Comments, history and files stay with the original.
 */
export async function duplicateTask(actor: Actor, taskId: string, database = db) {
  return database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, taskId, tx)
    const at = now()
    const id = uuid()
    const suffix = " (copy)"
    await tx.insert(projectTasks).values({
      id,
      projectId: task.projectId,
      title: `${task.title.slice(0, LIMITS.taskTitle - suffix.length)}${suffix}`,
      notes: storedNotesForCopy(task.notes),
      status: "todo",
      dueDate: task.dueDate,
      dueAt: task.dueAt,
      startDate: task.startDate,
      milestoneId: task.milestoneId,
      position: await nextTaskPosition(task.projectId, tx),
      createdByUserId: actor.id,
      createdAt: at,
      updatedAt: at,
      priority: task.priority,
    })
    await recordTaskEvent(tx, { taskId: id, kind: "created", actorUserId: actor.id })
    return { id }
  })
}

export type MoveTarget = {
  id: string
  name: string
  color: ProjectColor
  /** Whether the person assigned is on that project; if not, the task moves with nobody assigned. */
  keepsAssignee: boolean
}

/**
 * The person's other open projects, for Move to project. A task on the site
 * admin's own list can go to any team's project, named with its team (Tyler,
 * 23 Oct 2026); everything else stays within its team.
 */
export async function listMoveTargets(
  membership: Membership,
  task: Pick<TaskRow, "projectId" | "assigneeUserId">,
  database: ProjectDb
): Promise<MoveTarget[]> {
  const fromOwnList = membership.siteAdmin && (await isAdminSpace(membership.teamId, database))
  const rows = await database
    .select({
      id: projectProjects.id,
      name: projectProjects.name,
      color: projectProjects.color,
      teamName: projectTeams.name,
    })
    .from(projectProjects)
    .innerJoin(projectTeams, eq(projectTeams.id, projectProjects.teamId))
    .where(
      and(
        fromOwnList ? isNull(projectTeams.personalUserId) : visibleProjectsWhere(membership),
        isNull(projectProjects.archivedAt),
        isNull(projectProjects.personalUserId)
      )
    )
    .orderBy(...(fromOwnList ? [asc(projectTeams.name)] : []), asc(projectProjects.name))
  const others = rows
    .filter((project) => project.id !== task.projectId)
    .map(({ teamName, ...project }) => ({
      ...project,
      name: fromOwnList ? `${teamName} · ${project.name}` : project.name,
    }))
  if (!task.assigneeUserId || others.length === 0) {
    return others.map((project) => ({ ...project, keepsAssignee: true }))
  }
  const onThem = await database
    .select({ projectId: projectProjectMembers.projectId })
    .from(projectProjectMembers)
    .where(
      and(
        eq(projectProjectMembers.userId, task.assigneeUserId),
        inArray(
          projectProjectMembers.projectId,
          others.map((project) => project.id)
        )
      )
    )
  const member = new Set(onThem.map((row) => row.projectId))
  return others.map((project) => ({ ...project, keepsAssignee: member.has(project.id) }))
}

/**
 * Moves a task to another open project in the team. Its chat, files and
 * history go with it. The site admin may also move one to another team's
 * project, from their My dashboard's Project chip (Tyler, 23 Oct 2026). If
 * the person assigned isn't on the new project, the task moves with nobody
 * assigned and their name kept. Past check-in lines keep the old project:
 * that's where the task was that day.
 */
export async function moveTask(
  actor: Actor,
  input: { taskId: string; projectId: string },
  database = db
): Promise<{ keptAssignee: boolean }> {
  return database.transaction(async (tx) => {
    const { project: from, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    // The site admin may put a task of theirs in their own list, made now if it isn't yet
    // (Tyler, 23 Oct 2026: "its missing a 'just me' option").
    const siteAdmin = await isSiteAdmin(actor.id, tx)
    const toId =
      input.projectId === PERSONAL_PROJECT_ID && siteAdmin
        ? await resolveProjectId(actor.id, input.projectId, tx)
        : input.projectId
    if (toId === task.projectId) return { keptAssignee: true }
    const { project: to } = await requireOpenProject(actor.id, toId, tx)
    // A shared task never disappears into someone's own "Just me" list, except a
    // task the site admin is doing, into their own.
    const intoOwnList = siteAdmin && to.personalUserId === actor.id && task.assigneeUserId === actor.id
    if (!intoOwnList) requireSharedProject(to)
    // The site admin is on no project, so a task they took goes with them.
    const keptAssignee =
      !task.assigneeUserId ||
      (await isProjectMember(to.id, task.assigneeUserId, tx)) ||
      (await isSiteAdmin(task.assigneeUserId, tx))
    if (!keptAssignee) await clearAssignee(task.assigneeUserId!, eq(projectTasks.id, task.id), tx)
    await tx
      .update(projectTasks)
      .set({
        projectId: to.id,
        milestoneId: null,
        position: await nextTaskPosition(to.id, tx),
        updatedAt: now(),
      })
      .where(eq(projectTasks.id, task.id))
    // The old project's id, not its name: the name is shown only to people
    // who can see that project.
    await recordTaskEvent(tx, {
      taskId: task.id,
      kind: "moved",
      actorUserId: actor.id,
      reason: from.id,
    })
    return { keptAssignee }
  })
}

export type BulkChange =
  | { kind: "status"; status: TaskStatus; stuckReason: string | null }
  | { kind: "assign"; assigneeUserId: string | null; note?: string | null }
  | { kind: "due"; dueDate: string | null }
  | { kind: "move"; projectId: string }
  | { kind: "priority"; priority: TaskPriority }
  | { kind: "delete" }

export type BulkOutcome = {
  changed: string[]
  refused: { taskId: string; title: string; reason: string }[]
  /**
   * After a new due date: how many changed tasks now fall on their person's
   * day off or a team holiday, so the bar can say so (Seven features, part 1).
   * Left out when none do.
   */
  onDaysOff?: number
}

/**
 * One change over many tasks, each checked on its own as if changed alone, so
 * a task this person can't change is refused alone and the rest go through.
 * Each still writes its own history and notices.
 */
export async function changeManyTasks(
  actor: Actor,
  input: { taskIds: string[]; change: BulkChange },
  database = db
): Promise<BulkOutcome> {
  const outcome: BulkOutcome = { changed: [], refused: [] }
  const ids = [...new Set(input.taskIds)]
  const titles = new Map(
    (
      await database
        .select({ id: projectTasks.id, title: projectTasks.title })
        .from(projectTasks)
        .where(inArray(projectTasks.id, ids))
    ).map((row) => [row.id, row.title])
  )
  const { change } = input
  for (const taskId of ids) {
    try {
      if (change.kind === "status") {
        await setTaskStatus(
          actor,
          { taskId, status: change.status, stuckReason: change.stuckReason },
          database
        )
      } else if (change.kind === "assign") {
        await assignTask(
          actor,
          { taskId, assigneeUserId: change.assigneeUserId, note: change.note },
          database
        )
      } else if (change.kind === "due") {
        await updateTask(actor, { taskId, dueDate: change.dueDate }, database)
      } else if (change.kind === "priority") {
        await updateTask(actor, { taskId, priority: change.priority }, database)
      } else if (change.kind === "delete") {
        // Into the project's bin, on the same rule as one task: its maker or the site admin.
        await deleteTask(actor, taskId, database)
      } else {
        await moveTask(actor, { taskId, projectId: change.projectId }, database)
      }
      outcome.changed.push(taskId)
    } catch (error) {
      // A task the person can't see keeps its title to itself.
      const reason = getProjectErrorMessage(error)
      outcome.refused.push({
        taskId,
        title: reason === PROJECT_ERRORS.taskNotFound ? "" : (titles.get(taskId) ?? ""),
        reason,
      })
    }
  }
  if (change.kind === "due" && change.dueDate && outcome.changed.length) {
    const onDaysOff = await countOnDaysOff(outcome.changed, change.dueDate, database)
    if (onDaysOff) outcome.onDaysOff = onDaysOff
  }
  return outcome
}

/**
 * How many of these tasks are due on their team's holiday, or on their
 * person's time off, that day. The team comes from each task's project, since
 * the site admin is on no team and one change can cover tasks from several.
 */
async function countOnDaysOff(taskIds: string[], day: string, database: ProjectDb) {
  const tasks = await database
    .select({ assigneeUserId: projectTasks.assigneeUserId, teamId: projectProjects.teamId })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(and(inArray(projectTasks.id, taskIds), notInArray(projectTasks.status, CLOSED_TASK_STATUSES)))
  const teams = [...new Set(tasks.map((task) => task.teamId))]
  const holidayTeams = new Set<string>()
  for (const teamId of teams) if (await holidayOn(teamId, day, database)) holidayTeams.add(teamId)
  const people = [...new Set(tasks.map((task) => task.assigneeUserId).filter((id): id is string => Boolean(id)))]
  const away = people.length ? await awayOn(people, day, database) : new Set<string>()
  return tasks.filter(
    (task) => holidayTeams.has(task.teamId) || (task.assigneeUserId && away.has(task.assigneeUserId))
  ).length
}

/** Open projects this person can make a task in, with who can be handed it. */
export type NewTaskProject = {
  id: string
  name: string
  color: ProjectColor
  members: { userId: string; name: string; avatarUrl: string }[]
}

/** "Just me" in New task's project picker, by its stand-in id, so opening the window makes nothing. */
export function justMeChoice(me: { id: string; name: string; avatarUrl: string }): NewTaskProject {
  return {
    id: PERSONAL_PROJECT_ID,
    name: PERSONAL_PROJECT_NAME,
    color: "slate",
    members: [{ userId: me.id, name: me.name, avatarUrl: me.avatarUrl }],
  }
}

export async function listNewTaskProjects(
  membership: Membership,
  me: { id: string; name: string; avatarUrl: string },
  database: ProjectDb = db
): Promise<NewTaskProject[]> {
  // "Just me" goes last, by its stand-in id, so opening the window makes nothing.
  const justMe = justMeChoice(me)
  const projects = await database
    .select({
      id: projectProjects.id,
      name: projectProjects.name,
      color: projectProjects.color,
    })
    .from(projectProjects)
    .where(
      and(
        visibleProjectsWhere(membership),
        isNull(projectProjects.archivedAt),
        isNull(projectProjects.personalUserId)
      )
    )
    .orderBy(asc(projectProjects.name))
  // The site admin's own list is on no team, so it is offered once, not per team.
  const own = membership.siteAdmin ? [] : [justMe]
  if (projects.length === 0) return own
  const members = await database
    .select({
      projectId: projectProjectMembers.projectId,
      userId: projectProjectMembers.userId,
      name: customShellUsers.name,
      avatarUrl: customShellUsers.avatarUrl,
    })
    .from(projectProjectMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectProjectMembers.userId))
    .where(
      inArray(
        projectProjectMembers.projectId,
        projects.map((project) => project.id)
      )
    )
    .orderBy(asc(customShellUsers.name))
  // The site admin can give a new task to themselves on any project.
  const self = membership.siteAdmin ? [{ userId: me.id, name: me.name, avatarUrl: me.avatarUrl }] : []
  return [
    ...projects.map((project) => ({
      ...project,
      members: [
        ...members
          .filter((member) => member.projectId === project.id)
          .map(({ userId, name, avatarUrl }) => ({ userId, name, avatarUrl: avatarUrl ?? "" })),
        ...self,
      ],
    })),
    ...own,
  ]
}
