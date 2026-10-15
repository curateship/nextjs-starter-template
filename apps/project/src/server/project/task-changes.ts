import { and, asc, eq, inArray, isNull } from "drizzle-orm"

import { getProjectErrorMessage, PROJECT_ERRORS } from "@/lib/project/errors"
import {
  LIMITS,
  PERSONAL_PROJECT_ID,
  PERSONAL_PROJECT_NAME,
  type ProjectColor,
  type TaskStatus,
} from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  isProjectMember,
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
  projectTaskLabels,
  projectTaskSteps,
  projectTasks,
} from "@/server/project/schema"
import { requireSharedProject } from "@/server/project/personal"
import {
  clearPersonValuesOffProject,
  copyFieldValues,
  listTeamTypes,
  projectOffersType,
} from "@/server/project/task-types"
import { nextTaskPosition } from "@/server/project/sections"
import { recordTaskEvent } from "@/server/project/task-history"
import {
  assignTask,
  createTask,
  requireStep,
  setTaskStatus,
  touchTask,
  updateTask,
  type Actor,
} from "@/server/project/tasks"
import { clearAssignee } from "@/server/project/teams"
import { customShellUsers } from "@/server/schema"

/**
 * Faster ways to make and change tasks: many from a pasted list, a copy, a
 * move to another project, a step grown into its own task, and one change
 * over many rows. Every hand-over still goes through `assignTask` or
 * `createTask`, so it writes its history row and sends "gave you a task" as a
 * single one does.
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
          steps: [],
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
 * "<title> (copy)" in the same project and section, with the notes, labels,
 * steps (unticked), type and field values and priority, To do and nobody
 * assigned.
 * Comments, history and files stay with the original, so a File field starts
 * empty.
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
      notes: task.notes,
      status: "todo",
      dueDate: task.dueDate,
      dueAt: task.dueAt,
      startDate: task.startDate,
      sectionId: task.sectionId,
      milestoneId: task.milestoneId,
      position: await nextTaskPosition(task.projectId, tx),
      createdByUserId: actor.id,
      createdAt: at,
      updatedAt: at,
      typeId: task.typeId,
      priority: task.priority,
    })
    await copyFieldValues(tx, [{ from: task.id, to: id }], actor.id)
    const steps = await tx
      .select({ text: projectTaskSteps.text, position: projectTaskSteps.position })
      .from(projectTaskSteps)
      .where(eq(projectTaskSteps.taskId, task.id))
      .orderBy(asc(projectTaskSteps.position))
    if (steps.length) {
      await tx.insert(projectTaskSteps).values(
        steps.map((step) => ({
          id: uuid(),
          taskId: id,
          text: step.text,
          done: false,
          position: step.position,
          createdAt: at,
        }))
      )
    }
    const labels = await tx
      .select({ labelId: projectTaskLabels.labelId })
      .from(projectTaskLabels)
      .where(eq(projectTaskLabels.taskId, task.id))
    if (labels.length) {
      await tx.insert(projectTaskLabels).values(labels.map(({ labelId }) => ({ taskId: id, labelId })))
    }
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
  /** Whether that project offers the task's type. It keeps its type either way. */
  offersType: boolean
}

/** The person's other open projects, for Move to project. */
export async function listMoveTargets(
  membership: Membership,
  task: Pick<TaskRow, "projectId" | "assigneeUserId" | "typeId">,
  database: ProjectDb
): Promise<MoveTarget[]> {
  const rows = await database
    .select({
      id: projectProjects.id,
      name: projectProjects.name,
      color: projectProjects.color,
      hiddenTypeIds: projectProjects.hiddenTypeIds,
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
  const others = rows
    .filter((project) => project.id !== task.projectId)
    .map(({ hiddenTypeIds, ...project }) => ({
      ...project,
      offersType: projectOffersType({ hiddenTypeIds }, task.typeId),
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
 * Moves a task to another open project in the team. Its steps, chat, files,
 * labels, type, field values and history go with it, even when the new
 * project doesn't offer its type. Its section stays behind, since sections
 * are one project's own. If the person assigned isn't on the new project,
 * the task moves with nobody assigned and their name kept, and a Person
 * field naming someone who isn't on it is emptied. Past check-in lines keep
 * the old project: that's where the task was that day.
 */
export async function moveTask(
  actor: Actor,
  input: { taskId: string; projectId: string },
  database = db
): Promise<{ keptAssignee: boolean }> {
  return database.transaction(async (tx) => {
    const { project: from, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    if (input.projectId === task.projectId) return { keptAssignee: true }
    const { project: to } = await requireOpenProject(actor.id, input.projectId, tx)
    // A shared task never disappears into someone's own "Just me" list.
    requireSharedProject(to)
    const keptAssignee =
      !task.assigneeUserId || (await isProjectMember(to.id, task.assigneeUserId, tx))
    if (!keptAssignee) await clearAssignee(task.assigneeUserId!, eq(projectTasks.id, task.id), tx)
    await tx
      .update(projectTasks)
      .set({
        projectId: to.id,
        sectionId: null,
        milestoneId: null,
        position: await nextTaskPosition(to.id, tx),
        updatedAt: now(),
      })
      .where(eq(projectTasks.id, task.id))
    // People on steps who aren't on the new project come off their steps.
    const steps = await tx
      .select({ id: projectTaskSteps.id, userId: projectTaskSteps.assigneeUserId })
      .from(projectTaskSteps)
      .where(eq(projectTaskSteps.taskId, task.id))
    for (const step of steps) {
      if (step.userId && !(await isProjectMember(to.id, step.userId, tx))) {
        await tx
          .update(projectTaskSteps)
          .set({ assigneeUserId: null })
          .where(eq(projectTaskSteps.id, step.id))
      }
    }
    await clearPersonValuesOffProject(task.id, to.id, tx)
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

/**
 * A step that grew too big becomes its own task in the same project, with
 * the step's text, person and due date. The step leaves the old task, and
 * both tasks' histories say so with a link to the other.
 */
export async function promoteStep(actor: Actor, stepId: string, database = db) {
  return database.transaction(async (tx) => {
    const step = await requireStep(actor.id, stepId, tx)
    const { task: parent } = await requireTaskAccess(actor.id, step.taskId, tx)
    const [full] = await tx
      .select({ dueDate: projectTaskSteps.dueDate })
      .from(projectTaskSteps)
      .where(eq(projectTaskSteps.id, step.id))
    const { id } = await createTask(
      actor,
      {
        projectId: parent.projectId,
        title: step.text,
        notes: "",
        assigneeUserId: step.assigneeUserId,
        dueDate: full?.dueDate ?? null,
        steps: [],
      },
      tx
    )
    await tx.delete(projectTaskSteps).where(eq(projectTaskSteps.id, step.id))
    await touchTask(parent.id, tx)
    await recordTaskEvent(tx, {
      taskId: parent.id,
      kind: "became_task",
      actorUserId: actor.id,
      reason: step.text,
      relatedTaskId: id,
    })
    await recordTaskEvent(tx, {
      taskId: id,
      kind: "from_step",
      actorUserId: actor.id,
      reason: step.text,
      relatedTaskId: parent.id,
    })
    return { id }
  })
}

export type BulkChange =
  | { kind: "status"; status: TaskStatus; stuckReason: string | null }
  | { kind: "assign"; assigneeUserId: string | null; note?: string | null }
  | { kind: "due"; dueDate: string | null }
  | { kind: "move"; projectId: string }

export type BulkOutcome = {
  changed: string[]
  refused: { taskId: string; title: string; reason: string }[]
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
  return outcome
}

/** Open projects this person can make a task in, with who can be handed it. */
export type NewTaskProject = {
  id: string
  name: string
  color: ProjectColor
  members: { userId: string; name: string; avatarUrl: string }[]
  /** The team's types this project offers, in the team's order. "Just me" offers every live type. */
  typeIds: string[]
  /** The type New task starts on here, when it is still offered. */
  defaultTypeId: string | null
}

export async function listNewTaskProjects(
  membership: Membership,
  me: { id: string; name: string; avatarUrl: string },
  database: ProjectDb = db
): Promise<NewTaskProject[]> {
  const types = (await listTeamTypes(membership.teamId, database)).filter((type) => !type.archived)
  const offered = (hidden: readonly string[]) =>
    types.filter((type) => !hidden.includes(type.id)).map((type) => type.id)
  // "Just me" goes last, by its stand-in id, so opening the window makes nothing.
  const justMe: NewTaskProject = {
    id: PERSONAL_PROJECT_ID,
    name: PERSONAL_PROJECT_NAME,
    color: "slate",
    members: [{ userId: me.id, name: me.name, avatarUrl: me.avatarUrl }],
    typeIds: offered([]),
    defaultTypeId: null,
  }
  const projects = await database
    .select({
      id: projectProjects.id,
      name: projectProjects.name,
      color: projectProjects.color,
      hiddenTypeIds: projectProjects.hiddenTypeIds,
      defaultTypeId: projectProjects.defaultTypeId,
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
  if (projects.length === 0) return [justMe]
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
  return [
    ...projects.map(({ hiddenTypeIds, defaultTypeId, ...project }) => ({
      ...project,
      typeIds: offered(hiddenTypeIds),
      defaultTypeId:
        defaultTypeId && offered(hiddenTypeIds).includes(defaultTypeId) ? defaultTypeId : null,
      members: members
        .filter((member) => member.projectId === project.id)
        .map(({ userId, name, avatarUrl }) => ({ userId, name, avatarUrl: avatarUrl ?? "" })),
    })),
    justMe,
  ]
}
