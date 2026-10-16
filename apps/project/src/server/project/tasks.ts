import { and, asc, count, countDistinct, eq, inArray, isNull, max, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { addDays } from "@/lib/project/days"
import { dueMoveReason } from "@/lib/project/due-moves"
import { PROJECT_ERRORS, getProjectErrorMessage } from "@/lib/project/errors"
import type { TaskNoticeKind } from "@/lib/project/notices"
import { taskNotesText } from "@/lib/project/notes"
import { LIMITS, runsTheTeam, type TaskPriority, type TaskStatus } from "@/lib/project/rules"
import type { FieldValues } from "@/lib/project/task-fields"
import type { TaskTypeChip } from "@/lib/project/task-types"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  findMembership,
  isProjectMember,
  requireOpenProject,
  requireTaskAccess,
  visibleProjectIds,
  whoCanStillSee,
  type Membership,
  type ProjectDb,
  type TaskRow,
} from "@/server/project/access"
import { markTaskRead, unreadByTask } from "@/server/project/chat-reads"
import { taskRef, writeTaskNotices, type TaskNotice } from "@/server/project/notices"
import { labelsForTasks, listTeamLabels, type Label } from "@/server/project/labels"
import {
  listSections,
  nextTaskPosition,
  requireSectionOf,
  type Section,
} from "@/server/project/sections"
import { loadTaskMessages, type ChatMessage } from "@/server/project/task-chat"
import { keepNotesVersion } from "@/server/project/task-note-versions"
import {
  notesForReader,
  notesLinkedTaskIds,
  openableLinks,
  resolveTaskLinks,
} from "@/server/project/task-links"
import { listTaskFiles, type TaskFile } from "@/server/project/task-files"
import { resolveProjectId } from "@/server/project/personal"
import {
  repeatRuleOf,
  tellWaitingTasks,
  waitingOnThis,
  waitsFor,
  type RepeatRule,
  type WaitRow,
} from "@/server/project/planning"
import { myReminderOn } from "@/server/project/task-reminders"
import { listStepLists, type StepList } from "@/server/project/step-lists"
import { canAskForReview, canReview, reviewerFor } from "@/server/project/task-review"
import { hasThanked } from "@/server/project/task-thanks"
import { listMoveTargets, type MoveTarget } from "@/server/project/task-changes"
import { followerIds } from "@/server/project/task-followers"
import {
  loadTaskFields,
  requireDoneFields,
  typeChipsFor,
  valuesForTasks,
  writeNewTaskFields,
  type TaskFields,
} from "@/server/project/task-types"
import {
  loadTaskHistory,
  recordTaskEvent,
  type TaskHistoryEntry,
} from "@/server/project/task-history"
import {
  projectCheckinItems,
  projectCheckins,
  projectProjectMembers,
  projectProjects,
  projectSections,
  projectTaskComments,
  projectTaskEvents,
  projectTaskFollowers,
  projectTaskSteps,
  projectTasks,
  projectTeamMembers,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"
import { listMilestones, type Milestone } from "@/server/project/milestones"

/**
 * Tasks. The rules Tyler set, in `workspace/docs/what-this-app-is.md`:
 *
 * - Anyone can hand a task to anyone on the project, and the task records who
 *   handed it out.
 * - A task handed to someone else is Waiting until they accept it. They can
 *   accept it or hand it back with a reason.
 * - Stuck needs a one-line reason, and tells the person who handed it out.
 */

export type Actor = { id: string; name: string }

export type Person = {
  id: string
  name: string
  avatarUrl: string
  /** A job title, where one is shown beside the name (the hand-to picker). */
  title?: string | null
}

export type TaskCard = {
  id: string
  projectId: string
  projectName: string
  /** The project's client, for the client filter (Features 16 Oct, part 9). */
  projectClient: string | null
  title: string
  status: TaskStatus
  stuckReason: string | null
  dueDate: string | null
  /** The moment it is due by, when it has a time; null is due all day. */
  dueAt: string | null
  /** The optional first day, drawn with the due date on the Timeline. */
  startDate: string | null
  assignee: Person | null
  assignedBy: { id: string; name: string } | null
  /** Who made it, when they still have an account: they, and the team's owners and admins, can delete it. */
  createdByUserId: string | null
  /** Handed to someone who hasn't accepted it yet. */
  waiting: boolean
  /** The hand-over's note, shown beside Waiting until the task is accepted. */
  handoverNote: string | null
  /**
   * "Needs review" is on, and who reviews it. `waiting`: Done and waiting for
   * them to confirm it. It still counts as Done everywhere.
   */
  review: { needed: boolean; waiting: boolean; reviewer: { id: string; name: string } | null }
  formerAssigneeName: string | null
  handedBack: { byName: string; reason: string } | null
  steps: { done: number; total: number }
  commentCount: number
  /**
   * Messages in its chat that are new to the person looking, filled in by the
   * screens that show it (`src/server/project/chat-reads.ts`); 0 elsewhere.
   */
  unread: number
  /** How many days anyone picked this task on a check-in. */
  pickedDays: number
  labels: Label[]
  section: { id: string; name: string } | null
  /** The milestone it counts toward, for the details panel's list of a milestone's tasks. */
  milestoneId: string | null
  /** The task's place in its project's own order. */
  position: number
  /** When it last became Done. */
  completedAt: string | null
  /** The notes' words, so a search can find them. */
  notesText: string
  /** Out of the check-in and My tasks until this day. */
  snoozedUntil: string | null
  /**
   * The tasks that have to happen first, up to 10, and whether all are Done.
   * A title shows only when that task is in the same project; one elsewhere
   * reads "1 task in another project". Null when it waits on nothing.
   */
  waitingOn: { tasks: { taskId: string; title: string | null; done: boolean }[]; ready: boolean } | null
  priority: TaskPriority
  /** How many times its due date moved from one day to another. */
  dueMoves: number
  repeat: RepeatRule | null
  /** The kind of task, drawn as its icon and name. Null is a plain task. */
  type: TaskTypeChip | null
  /** What it holds in its type's fields, for the List's field columns. A File field holds its file count. */
  fieldValues: FieldValues
}

const assignee = alias(customShellUsers, "assignee")
const assigner = alias(customShellUsers, "assigner")
const returner = alias(customShellUsers, "returner")
const reviewer = alias(customShellUsers, "reviewer")

export async function listTaskCards(
  where: SQL | undefined,
  database: ProjectDb = db
): Promise<TaskCard[]> {
  const rows = await database
    .select({
      task: projectTasks,
      projectName: projectProjects.name,
      projectClient: projectProjects.client,
      assigneeName: assignee.name,
      assigneeAvatar: assignee.avatarUrl,
      assignerName: assigner.name,
      returnerName: returner.name,
      reviewerName: reviewer.name,
      sectionName: projectSections.name,
    })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .leftJoin(assignee, eq(assignee.id, projectTasks.assigneeUserId))
    .leftJoin(assigner, eq(assigner.id, projectTasks.assignedByUserId))
    .leftJoin(returner, eq(returner.id, projectTasks.handedBackByUserId))
    .leftJoin(reviewer, eq(reviewer.id, projectTasks.reviewerUserId))
    .leftJoin(projectSections, eq(projectSections.id, projectTasks.sectionId))
    // A task in the bin is gone from every list until it is brought back.
    .where(and(isNull(projectTasks.deletedAt), where))
    // Each project's own order, which the team sets by dragging.
    .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt))

  const ids = rows.map((row) => row.task.id)
  const stepRows = ids.length
    ? await database
        .select({
          taskId: projectTaskSteps.taskId,
          done: projectTaskSteps.done,
          total: count(),
        })
        .from(projectTaskSteps)
        .where(inArray(projectTaskSteps.taskId, ids))
        .groupBy(projectTaskSteps.taskId, projectTaskSteps.done)
    : []
  const commentRows = ids.length
    ? await database
        .select({ taskId: projectTaskComments.taskId, total: count() })
        .from(projectTaskComments)
        .where(and(inArray(projectTaskComments.taskId, ids), isNull(projectTaskComments.deletedAt)))
        .groupBy(projectTaskComments.taskId)
    : []
  const pickedRows = ids.length ? await pickedDaysFor(ids, database) : []
  const moveRows = ids.length ? await dueMovesFor(ids, database) : []
  const waits = await waitsFor(ids, database)
  const labels = await labelsForTasks(ids, database)
  const tasks = rows.map((row) => row.task)
  const types = await typeChipsFor(
    tasks.flatMap((task) => (task.typeId ? [task.typeId] : [])),
    database
  )
  const fieldValues = await valuesForTasks(tasks, database)

  return rows.map(({ task, ...row }) => {
    const steps = stepRows.filter((step) => step.taskId === task.id)
    return {
      id: task.id,
      projectId: task.projectId,
      projectName: row.projectName,
      projectClient: row.projectClient,
      title: task.title,
      status: task.status,
      stuckReason: task.stuckReason,
      dueDate: task.dueDate,
      dueAt: task.dueAt?.toISOString() ?? null,
      startDate: task.startDate,
      assignee:
        task.assigneeUserId && row.assigneeName !== null
          ? {
              id: task.assigneeUserId,
              name: row.assigneeName,
              avatarUrl: row.assigneeAvatar ?? "",
            }
          : null,
      assignedBy:
        task.assignedByUserId && row.assignerName !== null
          ? { id: task.assignedByUserId, name: row.assignerName }
          : null,
      createdByUserId: task.createdByUserId,
      waiting: isWaiting(task),
      handoverNote: isWaiting(task) ? task.handoverNote : null,
      review: {
        needed: task.needsReview,
        waiting: task.status === "done" && Boolean(task.reviewWaitingSince),
        reviewer:
          task.reviewerUserId && row.reviewerName !== null
            ? { id: task.reviewerUserId, name: row.reviewerName }
            : null,
      },
      formerAssigneeName: task.formerAssigneeName,
      handedBack:
        task.handedBackReason && row.returnerName !== null
          ? { byName: row.returnerName, reason: task.handedBackReason }
          : null,
      steps: {
        done: steps.find((step) => step.done)?.total ?? 0,
        total: steps.reduce((sum, step) => sum + step.total, 0),
      },
      commentCount: commentRows.find((c) => c.taskId === task.id)?.total ?? 0,
      unread: 0,
      pickedDays: pickedRows.find((p) => p.taskId === task.id)?.days ?? 0,
      labels: labels.get(task.id) ?? [],
      section:
        task.sectionId && row.sectionName !== null
          ? { id: task.sectionId, name: row.sectionName }
          : null,
      milestoneId: task.milestoneId,
      position: task.position,
      completedAt: task.completedAt?.toISOString() ?? null,
      notesText: taskNotesText(task.notes),
      snoozedUntil: task.snoozedUntil,
      waitingOn: waitingOnOf(task.projectId, waits.get(task.id) ?? []),
      priority: task.priority,
      dueMoves: moveRows.find((m) => m.taskId === task.id)?.moves ?? 0,
      repeat: repeatRuleOf(task),
      type: task.typeId ? (types.get(task.typeId) ?? null) : null,
      fieldValues: fieldValues.get(task.id) ?? {},
    }
  })
}

/** The cards with how many messages in each chat are new to this person. */
export async function withUnread(viewer: Membership, cards: TaskCard[], database: ProjectDb) {
  const unread = await unreadByTask(
    viewer,
    cards.map((card) => card.id),
    database
  )
  return cards.map((card) => ({ ...card, unread: unread.get(card.id) ?? 0 }))
}

function waitingOnOf(projectId: string, waits: WaitRow[]) {
  if (waits.length === 0) return null
  return {
    tasks: waits.map((wait) => ({
      taskId: wait.id,
      title: wait.projectId === projectId ? wait.title : null,
      done: wait.status === "done",
    })),
    ready: waits.every((wait) => wait.status === "done"),
  }
}

/** How many times each task's due date moved, read from its history. */
function dueMovesFor(taskIds: string[], database: ProjectDb) {
  return database
    .select({ taskId: projectTaskEvents.taskId, moves: count() })
    .from(projectTaskEvents)
    .where(and(inArray(projectTaskEvents.taskId, taskIds), eq(projectTaskEvents.kind, "due_moved")))
    .groupBy(projectTaskEvents.taskId)
}

/** Distinct days each task was picked, by anyone, read from the saved check-ins. */
function pickedDaysFor(taskIds: string[], database: ProjectDb) {
  return database
    .select({ taskId: projectCheckinItems.taskId, days: countDistinct(projectCheckins.day) })
    .from(projectCheckinItems)
    .innerJoin(projectCheckins, eq(projectCheckins.id, projectCheckinItems.checkinId))
    .where(and(inArray(projectCheckinItems.taskId, taskIds), eq(projectCheckinItems.kind, "pick")))
    .groupBy(projectCheckinItems.taskId)
}

function isWaiting(task: Pick<TaskRow, "assigneeUserId" | "acceptedAt">) {
  return Boolean(task.assigneeUserId) && !task.acceptedAt
}

export type TaskStep = {
  id: string
  text: string
  done: boolean
  /** Someone on the project doing this step. It shows only inside the task. */
  assignee: Person | null
  dueDate: string | null
}

export type TaskDetail = {
  task: TaskCard & { notes: string }
  steps: TaskStep[]
  comments: ChatMessage[]
  /** Tasks the notes link to that I can open: task id to project id. */
  noteLinks: Record<string, string>
  files: TaskFile[]
  /** Who the task can be handed to, and who the chat can tag: the project's members. */
  assignable: Person[]
  /** I get this task's chat, Stuck and Done notices without being assigned. */
  following: boolean
  archived: boolean
  canDelete: boolean
  /** Every day it was picked or dropped, and every hand-over, oldest first. */
  history: TaskHistoryEntry[]
  /** The project's sections, for the task's Section field. */
  sections: Section[]
  /** The team's labels, for the task's Labels field. */
  labels: Label[]
  /** Other open projects this person can move the task to. */
  moveTargets: MoveTarget[]
  /** The tasks this one waits on, each named when this person can see its project. */
  waitingOn: { id: string; title: string | null; projectId: string | null; done: boolean }[]
  /** The day I asked to be reminded about it, if I did. Each person's own. */
  myReminder: string | null
  /** The team's saved step lists, for "Add a step list". */
  stepLists: StepList[]
  /** Tasks waiting on this one: those this person can see, and how many elsewhere. */
  holdingUp: { tasks: { id: string; title: string; projectId: string }[]; elsewhere: number }
  /** I handed it out or made it, so I can turn "Needs review" on or off. */
  canAskForReview: boolean
  /** I may confirm it or send it back while it waits for review. */
  canReview: boolean
  /** I've thanked whoever did it. */
  thanked: boolean
  /** Its type, the fields as I may use them, their values and files, and the types it could have. */
  fields: TaskFields
  /** The milestone it counts toward, and the project's milestones to pick from on the Plan card. */
  milestoneId: string | null
  milestones: Milestone[]
}

export async function loadTaskDetail(
  userId: string,
  taskId: string,
  database = db
): Promise<TaskDetail> {
  const { membership, project, task } = await requireTaskAccess(userId, taskId, database, {
    allowArchived: true,
  }).catch(async (error: unknown) => {
    // Someone who can see the project is told a binned task is in its bin,
    // so a bell link to it explains itself. Anyone else still learns nothing.
    if (error instanceof Error && error.message === PROJECT_ERRORS.taskNotFound) {
      const binned = await requireTaskAccess(userId, taskId, database, {
        allowArchived: true,
        allowDeleted: true,
      }).catch(() => null)
      if (binned?.task.deletedAt) throw new Error(PROJECT_ERRORS.taskInBin)
    }
    throw error
  })
  const [card] = await listTaskCards(eq(projectTasks.id, taskId), database)
  const stepRows = await database
    .select({
      id: projectTaskSteps.id,
      text: projectTaskSteps.text,
      done: projectTaskSteps.done,
      dueDate: projectTaskSteps.dueDate,
      assigneeId: projectTaskSteps.assigneeUserId,
      assigneeName: assignee.name,
      assigneeAvatar: assignee.avatarUrl,
    })
    .from(projectTaskSteps)
    .leftJoin(assignee, eq(assignee.id, projectTaskSteps.assigneeUserId))
    .where(eq(projectTaskSteps.taskId, taskId))
    .orderBy(asc(projectTaskSteps.position))
  const steps: TaskStep[] = stepRows.map((row) => ({
    id: row.id,
    text: row.text,
    done: row.done,
    dueDate: row.dueDate,
    assignee:
      row.assigneeId && row.assigneeName !== null
        ? { id: row.assigneeId, name: row.assigneeName, avatarUrl: row.assigneeAvatar ?? "" }
        : null,
  }))
  const archived = Boolean(project.archivedAt)
  const viewer = { userId, role: membership.role }
  // Loading the task is reading its chat, so its "new" mark clears.
  await markTaskRead(userId, taskId, database)
  const visible = await visibleProjectIds(membership, database)
  const [follow] = await database
    .select({ userId: projectTaskFollowers.userId })
    .from(projectTaskFollowers)
    .where(and(eq(projectTaskFollowers.taskId, taskId), eq(projectTaskFollowers.userId, userId)))
    .limit(1)
  const assignable = await database
    .select({
      id: customShellUsers.id,
      name: customShellUsers.name,
      avatarUrl: customShellUsers.avatarUrl,
      title: projectTeamMembers.title,
    })
    .from(projectProjectMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectProjectMembers.userId))
    .leftJoin(
      projectTeamMembers,
      and(
        eq(projectTeamMembers.userId, projectProjectMembers.userId),
        eq(projectTeamMembers.teamId, project.teamId)
      )
    )
    .where(eq(projectProjectMembers.projectId, project.id))
    .orderBy(asc(customShellUsers.name))

  const noteTargets = await resolveTaskLinks(membership, notesLinkedTaskIds(task.notes), database)

  return {
    task: { ...card, notes: notesForReader(task.notes, noteTargets) },
    noteLinks: openableLinks(noteTargets),
    steps,
    comments: await loadTaskMessages(membership, taskId, archived, database),
    files: await listTaskFiles(viewer, taskId, archived, database),
    assignable: assignable.map((row) => ({ ...row, avatarUrl: row.avatarUrl ?? "" })),
    following: Boolean(follow),
    archived,
    canDelete: task.createdByUserId === userId || runsTheTeam(membership.role),
    history: await loadTaskHistory(taskId, database, visible),
    sections: await listSections(project.id, database),
    labels: await listTeamLabels(membership.teamId, database),
    moveTargets: await listMoveTargets(membership, task, database),
    waitingOn: ((await waitsFor([taskId], database)).get(taskId) ?? []).map((wait) => ({
      id: wait.id,
      title: visible.has(wait.projectId) ? wait.title : null,
      projectId: visible.has(wait.projectId) ? wait.projectId : null,
      done: wait.status === "done",
    })),
    myReminder: await myReminderOn(userId, taskId, database),
    stepLists: await listStepLists(membership.teamId, database),
    holdingUp: await waitingOnThis(taskId, visible, database),
    canAskForReview: canAskForReview(task, userId),
    canReview: canReview(task, membership.role, userId),
    thanked: await hasThanked(userId, taskId, database),
    fields: await loadTaskFields(viewer, task, project, archived, database),
    milestoneId: task.milestoneId,
    milestones: await listMilestones(project.id, database),
  }
}

/** My tasks on My dashboard: every task assigned to me, across every project I can see. */
/**
 * My tasks for My dashboard. An archived project's tasks leave it with the
 * project (Tyler, 14 Oct 2026), as they already leave the check-in: nothing in
 * an archived project can change, so they could only be refused.
 */
export async function loadMyWork(userId: string, database = db): Promise<TaskCard[]> {
  const membership = await findMembership(userId, database)
  if (!membership) return []
  const cards = await withUnread(
    membership,
    await listTaskCards(
      and(
        eq(projectTasks.assigneeUserId, userId),
        eq(projectProjects.teamId, membership.teamId),
        isNull(projectProjects.archivedAt)
      ),
      database
    ),
    database
  )
  // Waiting first, because those need an answer before anything else.
  return [...cards.filter((card) => card.waiting), ...cards.filter((card) => !card.waiting)]
}

export async function requireAssignable(projectId: string, userId: string, database: ProjectDb) {
  if (!(await isProjectMember(projectId, userId, database))) {
    throw new Error(PROJECT_ERRORS.notProjectMember)
  }
}

export async function createTask(
  actor: Actor,
  input: {
    projectId: string
    title: string
    notes: string
    assigneeUserId: string | null
    dueDate: string | null
    steps: string[]
    /** An optional line for the person it's handed to. */
    handoverNote?: string | null
    /** Its type, and the values New task filled in for that type's fields. */
    typeId?: string | null
    fieldValues?: Record<string, unknown>
  },
  database: ProjectDb = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const projectId = await resolveProjectId(actor.id, input.projectId, tx)
    input = { ...input, projectId }
    const { membership, project } = await requireOpenProject(actor.id, input.projectId, tx)
    if (input.assigneeUserId) await requireAssignable(input.projectId, input.assigneeUserId, tx)
    const at = now()
    const handedToSomeoneElse =
      input.assigneeUserId !== null && input.assigneeUserId !== actor.id
    const position = await nextTaskPosition(input.projectId, tx)
    const task = {
      id: uuid(),
      projectId: input.projectId,
      title: input.title,
      notes: input.notes,
      status: "todo" as const,
      assigneeUserId: input.assigneeUserId,
      assignedByUserId: input.assigneeUserId ? actor.id : null,
      // Taking a task yourself skips Waiting.
      acceptedAt: input.assigneeUserId && !handedToSomeoneElse ? at : null,
      dueDate: input.dueDate,
      createdByUserId: actor.id,
      createdAt: at,
      updatedAt: at,
      position,
      handoverNote: handedToSomeoneElse ? (input.handoverNote ?? null) : null,
      firstHandedOutByUserId: handedToSomeoneElse ? actor.id : null,
      typeId: input.typeId ?? null,
    }
    await tx.insert(projectTasks).values(task)
    if (input.typeId) {
      await writeNewTaskFields(tx, {
        membership,
        project,
        task,
        typeId: input.typeId,
        values: input.fieldValues ?? {},
        actor,
      })
    }
    await recordTaskEvent(tx, { taskId: task.id, kind: "created", actorUserId: actor.id })
    if (input.steps.length) {
      await tx.insert(projectTaskSteps).values(
        input.steps.map((text, position) => ({
          id: uuid(),
          taskId: task.id,
          text,
          done: false,
          position,
          createdAt: at,
        }))
      )
    }
    if (handedToSomeoneElse && input.assigneeUserId) {
      await recordTaskEvent(tx, {
        taskId: task.id,
        kind: "handed_over",
        actorUserId: actor.id,
        targetUserId: input.assigneeUserId,
        reason: task.handoverNote,
      })
      await writeTaskNotices(tx, [
        {
          kind: "task_assigned",
          recipientUserId: input.assigneeUserId,
          actor,
          task: taskRef(task),
          extra: task.handoverNote,
        },
      ])
    }
    return { id: task.id }
  })
}

export async function updateTask(
  actor: Actor,
  patch: {
    taskId: string
    title?: string
    notes?: string
    /** The notes editor's session, which keeps one earlier version however often it saves. */
    notesSession?: string
    dueDate?: string | null
    /** An ISO moment on the due date; null clears the time. */
    dueAt?: string | null
    startDate?: string | null
    sectionId?: string | null
    snoozedUntil?: string | null
    priority?: TaskPriority
  },
  database: ProjectDb = db
) {
  const { taskId, notesSession, dueAt: dueAtText, ...fields } = patch
  await database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, taskId, tx)
    if (fields.sectionId) await requireSectionOf(task.projectId, fields.sectionId, tx)
    // Either end may move, from the task, the Calendar, the Timeline or a bulk
    // change, and none may leave the start after the due day.
    const start = fields.startDate !== undefined ? fields.startDate : task.startDate
    const due = fields.dueDate !== undefined ? fields.dueDate : task.dueDate
    if (start && due && start > due) throw new Error(PROJECT_ERRORS.startAfterDue)
    // A new day without a time is due all day, from a bulk change, a quick
    // day or the Calendar alike, so an old time never lands on a new day.
    const dueAt =
      dueAtText !== undefined ? dueMoment(due, dueAtText) : fields.dueDate !== undefined ? null : undefined
    await tx
      .update(projectTasks)
      .set({ ...fields, ...(dueAt !== undefined ? { dueAt } : {}), updatedAt: now() })
      .where(eq(projectTasks.id, taskId))
    // A move is from one day to another. Setting a first date or clearing one
    // isn't, so neither counts toward "Date moved 3 times".
    if (fields.dueDate && task.dueDate && fields.dueDate !== task.dueDate) {
      await recordTaskEvent(tx, {
        taskId,
        kind: "due_moved",
        actorUserId: actor.id,
        reason: dueMoveReason(task.dueDate, fields.dueDate),
      })
    }
    if (fields.notes !== undefined && fields.notes !== task.notes) {
      await keepNotesVersion(tx, task, fields.notes, actor, notesSession ?? uuid())
    }
  })
}

/**
 * The "Due by" moment, which has to fall within a day either side of the due
 * date: every zone's clock is within 14 hours of UTC, so a time on the date
 * in any zone lands there, and anything further off is a mistake.
 */
function dueMoment(dueDate: string | null, dueAt: string | null) {
  if (dueAt === null) return null
  if (!dueDate) throw new Error(PROJECT_ERRORS.dueTimeNeedsDate)
  const at = new Date(dueAt)
  const day = at.toISOString().slice(0, 10)
  if (day < addDays(dueDate, -1) || day > addDays(dueDate, 1)) throw new Error(PROJECT_ERRORS.dueTimeNeedsDate)
  return at
}

export async function setTaskStatus(
  actor: Actor,
  input: { taskId: string; status: TaskStatus; stuckReason: string | null },
  database: ProjectDb = db
) {
  await database.transaction(async (tx) => {
    const { project, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    if (input.status === "stuck" && !input.stuckReason) {
      throw new Error(PROJECT_ERRORS.stuckNeedsReason)
    }
    const becameDone = input.status === "done" && task.status !== "done"
    // Only a fresh move to Done is checked, so a task already Done stays Done
    // when a field is later switched to "Needed before Done".
    if (becameDone) await requireDoneFields(task, tx)
    // A task that needs review waits for its reviewer once it becomes Done,
    // unless nobody else is left to review it, when it confirms itself.
    const reviewer = becameDone ? await reviewerFor(project, task, actor.id, tx) : null
    await tx
      .update(projectTasks)
      .set({
        status: input.status,
        // The reason shows on the task until it leaves Stuck.
        stuckReason: input.status === "stuck" ? input.stuckReason : null,
        // When it became Done, kept while it stays Done and cleared when it leaves.
        completedAt: input.status === "done" ? (task.status === "done" ? task.completedAt : now()) : null,
        reviewWaitingSince:
          input.status !== "done" ? null : becameDone ? (reviewer ? now() : null) : task.reviewWaitingSince,
        updatedAt: now(),
      })
      .where(eq(projectTasks.id, task.id))
    if (input.status !== task.status) {
      await recordTaskEvent(tx, {
        taskId: task.id,
        kind: "status_changed",
        actorUserId: actor.id,
        reason: input.status,
      })
    }

    // Stuck, Done and leaving Stuck each tell whoever handed the task out (or
    // made it, when nobody did), its followers and the project's lead, once
    // per change: someone who is two of those still gets one notice.
    const kind = statusNoticeKind(task.status, input.status)
    if (kind === "task_done") await tellWaitingTasks(actor, task.id, tx)
    if (!kind) return
    const handedOutBy = task.assignedByUserId ?? task.createdByUserId
    const recipients = await whoCanStillSee(
      project,
      [handedOutBy, project.leadUserId, ...(await followerIds(task.id, tx))],
      tx
    )
    await writeTaskNotices(tx, [
      // The reviewer hears "Ready for your review" instead of "marked a task Done".
      ...(reviewer
        ? [{ kind: "task_review" as const, recipientUserId: reviewer, actor, task: taskRef(task) }]
        : []),
      ...recipients
        .filter((recipientUserId) => recipientUserId !== reviewer)
        .map(
          (recipientUserId): TaskNotice => ({
            kind,
            recipientUserId,
            actor,
            task: taskRef(task),
            extra: kind === "task_stuck" ? input.stuckReason : null,
          })
        ),
    ])
  })
}

/** Which notice a status change sends: Stuck, Done, or unblocked when it leaves Stuck. */
function statusNoticeKind(from: TaskStatus, to: TaskStatus): TaskNoticeKind | null {
  if (to === "stuck") return "task_stuck"
  if (to === "done") return from === "done" ? null : "task_done"
  if (from === "stuck") return "task_unblocked"
  return null
}

export async function assignTask(
  actor: Actor,
  input: {
    taskId: string
    assigneeUserId: string | null
    /** An optional line for the person it's handed to. */
    note?: string | null
  },
  database: ProjectDb = db,
  /** Off when the caller sends one notice for many hand-overs. */
  { notify = true }: { notify?: boolean } = {}
) {
  await database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, input.taskId, tx)
    if (input.assigneeUserId === task.assigneeUserId) return
    if (input.assigneeUserId) await requireAssignable(task.projectId, input.assigneeUserId, tx)
    const at = now()
    const handedToSomeoneElse = Boolean(input.assigneeUserId) && input.assigneeUserId !== actor.id
    const note = handedToSomeoneElse ? (input.note ?? null) : null
    await tx
      .update(projectTasks)
      .set({
        assigneeUserId: input.assigneeUserId,
        assignedByUserId: input.assigneeUserId ? actor.id : null,
        acceptedAt: input.assigneeUserId === actor.id ? at : null,
        handedBackReason: null,
        handedBackByUserId: null,
        formerAssigneeName: null,
        handoverNote: note,
        // The first hand-out stays: later hand-overs never take over the brief.
        firstHandedOutByUserId:
          task.firstHandedOutByUserId ?? (handedToSomeoneElse ? actor.id : null),
        updatedAt: at,
      })
      .where(eq(projectTasks.id, task.id))
    if (handedToSomeoneElse && input.assigneeUserId) {
      // The history line keeps the note after the task is accepted.
      await recordTaskEvent(tx, {
        taskId: task.id,
        kind: "handed_over",
        actorUserId: actor.id,
        targetUserId: input.assigneeUserId,
        reason: note,
      })
      if (notify) {
        await writeTaskNotices(tx, [
          {
            kind: "task_assigned",
            recipientUserId: input.assigneeUserId,
            actor,
            task: taskRef(task),
            extra: note,
          },
        ])
      }
    }
  })
}

export async function acceptTask(actor: Actor, taskId: string, database = db) {
  await database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, taskId, tx)
    if (task.assigneeUserId !== actor.id) throw new Error(PROJECT_ERRORS.notAssignee)
    if (task.acceptedAt) return
    // The note was for the hand-over; its history line keeps it.
    await tx
      .update(projectTasks)
      .set({ acceptedAt: now(), handoverNote: null, updatedAt: now() })
      .where(eq(projectTasks.id, task.id))
    await recordTaskEvent(tx, { taskId: task.id, kind: "accepted", actorUserId: actor.id })
  })
}

/**
 * Hands the task back to whoever handed it out, with the reason. If that
 * person has since left the project, the task is left with nobody assigned.
 */
export async function handBackTask(
  actor: Actor,
  input: { taskId: string; reason: string },
  database = db
) {
  await database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, input.taskId, tx)
    if (task.assigneeUserId !== actor.id) throw new Error(PROJECT_ERRORS.notAssignee)
    const giver = task.assignedByUserId
    if (!giver || giver === actor.id) throw new Error(PROJECT_ERRORS.nothingToHandBack)
    const giverStillHere = await isProjectMember(task.projectId, giver, tx)
    const at = now()
    await tx
      .update(projectTasks)
      .set({
        assigneeUserId: giverStillHere ? giver : null,
        assignedByUserId: giverStillHere ? actor.id : null,
        // It's back with the person who handed it out, so it isn't Waiting.
        acceptedAt: giverStillHere ? at : null,
        handoverNote: null,
        handedBackReason: input.reason,
        handedBackByUserId: actor.id,
        updatedAt: at,
      })
      .where(eq(projectTasks.id, task.id))
    await recordTaskEvent(tx, {
      taskId: task.id,
      kind: "handed_back",
      actorUserId: actor.id,
      targetUserId: giverStillHere ? giver : null,
      reason: input.reason,
    })
    if (giverStillHere) {
      await writeTaskNotices(tx, [
        {
          kind: "task_handed_back",
          recipientUserId: giver,
          actor,
          task: taskRef(task),
          extra: input.reason,
        },
      ])
    }
  })
}

/**
 * Puts the task in its project's bin. It leaves every list at once and can
 * be brought back whole for 30 days, after which the daily job deletes it
 * and its files for good (`planning-jobs.ts`).
 */
export async function deleteTask(actor: Actor, taskId: string, database = db) {
  await database.transaction(async (tx) => {
    const { membership, task } = await requireTaskAccess(actor.id, taskId, tx)
    if (task.createdByUserId !== actor.id && !runsTheTeam(membership.role)) {
      throw new Error(PROJECT_ERRORS.cantDeleteTask)
    }
    await tx
      .update(projectTasks)
      .set({ deletedAt: now(), deletedByUserId: actor.id })
      .where(eq(projectTasks.id, task.id))
    await recordTaskEvent(tx, { taskId: task.id, kind: "deleted", actorUserId: actor.id })
  })
}

export async function addStep(
  actor: Actor,
  input: { taskId: string; text: string },
  database = db
): Promise<TaskStep> {
  return database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, input.taskId, tx)
    const [{ total, last }] = await tx
      .select({ total: count(), last: max(projectTaskSteps.position) })
      .from(projectTaskSteps)
      .where(eq(projectTaskSteps.taskId, task.id))
    if (total >= LIMITS.stepsPerTask) throw new Error(PROJECT_ERRORS.tooManySteps)
    const step = {
      id: uuid(),
      taskId: task.id,
      text: input.text,
      done: false,
      position: (last ?? -1) + 1,
      createdAt: now(),
    }
    await tx.insert(projectTaskSteps).values(step)
    await touchTask(task.id, tx)
    return { id: step.id, text: step.text, done: step.done, assignee: null, dueDate: null }
  })
}

export async function updateStep(
  actor: Actor,
  input: {
    stepId: string
    text?: string
    done?: boolean
    assigneeUserId?: string | null
    dueDate?: string | null
  },
  database = db
) {
  await database.transaction(async (tx) => {
    const { stepId, ...fields } = input
    const step = await requireStep(actor.id, stepId, tx)
    const { task } = await requireTaskAccess(actor.id, step.taskId, tx)
    if (fields.assigneeUserId) await requireAssignable(task.projectId, fields.assigneeUserId, tx)
    await tx.update(projectTaskSteps).set(fields).where(eq(projectTaskSteps.id, step.id))
    await touchTask(step.taskId, tx)
    // A step given to someone else tells them, once, when it is given.
    const given = fields.assigneeUserId
    if (given && given !== step.assigneeUserId) {
      await writeTaskNotices(tx, [
        {
          kind: "task_step",
          recipientUserId: given,
          actor,
          task: taskRef(task),
          extra: fields.text ?? step.text,
        },
      ])
    }
  })
}

export async function deleteStep(actor: Actor, stepId: string, database = db) {
  const step = await requireStep(actor.id, stepId, database)
  await database.delete(projectTaskSteps).where(eq(projectTaskSteps.id, step.id))
  await touchTask(step.taskId, database)
}

export async function requireStep(userId: string, stepId: string, database: ProjectDb) {
  const [step] = await database
    .select({
      id: projectTaskSteps.id,
      taskId: projectTaskSteps.taskId,
      text: projectTaskSteps.text,
      assigneeUserId: projectTaskSteps.assigneeUserId,
    })
    .from(projectTaskSteps)
    .where(eq(projectTaskSteps.id, stepId))
    .limit(1)
  if (!step) throw new Error(PROJECT_ERRORS.stepNotFound)
  await requireTaskAccess(userId, step.taskId, database)
  return step
}

export async function touchTask(taskId: string, database: ProjectDb) {
  await database
    .update(projectTasks)
    .set({ updatedAt: now() })
    .where(eq(projectTasks.id, taskId))
}

export type AcceptOutcome = {
  accepted: string[]
  refused: { taskId: string; title: string; reason: string }[]
}

/**
 * Accept all: every task waiting for me, each accepted on its own as if
 * alone, so each writes its history line, and one that has changed hands
 * since is refused alone with the reason.
 */
export async function acceptManyTasks(
  actor: Actor,
  taskIds: string[],
  database = db
): Promise<AcceptOutcome> {
  const outcome: AcceptOutcome = { accepted: [], refused: [] }
  for (const taskId of new Set(taskIds)) {
    try {
      await acceptTask(actor, taskId, database)
      outcome.accepted.push(taskId)
    } catch (error) {
      const reason = getProjectErrorMessage(error)
      // Only a task I can open, but that isn't mine to accept, is named.
      const [row] =
        reason !== PROJECT_ERRORS.notAssignee
          ? []
          : await database
              .select({ title: projectTasks.title })
              .from(projectTasks)
              .where(eq(projectTasks.id, taskId))
      outcome.refused.push({ taskId, title: row?.title ?? "", reason })
    }
  }
  return outcome
}
