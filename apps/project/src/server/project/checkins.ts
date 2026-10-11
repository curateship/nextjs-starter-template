import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { localNow, momentOf } from "@/lib/project/days"
import {
  LIMITS,
  PERSONAL_PROJECT_ID,
  PERSONAL_PROJECT_NAME,
  type CheckinNotes,
  type ProjectColor,
} from "@/lib/project/rules"
import { uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  requireMembership,
  requireTaskAccess,
  visibleProjectIds,
  visibleProjectsWhere,
  type Membership,
  type ProjectDb,
} from "@/server/project/access"
import {
  projectCheckinItems,
  projectCheckins,
  projectProjects,
  projectTasks,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { listTaskCards, type TaskCard } from "@/server/project/tasks"
import { awayOn } from "@/server/project/time-off"

/**
 * The morning check-in. The rules Tyler set are in
 * `workspace/docs/what-this-app-is.md`:
 *
 * - The team sets one check-in time, and each person can shift it to their
 *   own hours and time zone.
 * - "Today" is the person's own calendar day, in their own time zone.
 * - The check-in opens with every task picked on the last check-in that isn't
 *   Done, and each must be carried over or dropped with a reason before the
 *   check-in can be saved.
 * - Each check-in is saved as rows, and the end-of-day job saves each pick's
 *   status. History reads only those rows.
 */

/** When a person checks in: the team's time and zone, unless they set their own. */
export type CheckinClock = {
  teamTime: string
  teamZone: string
  workDays: number[]
  ownTime: string | null
  ownZone: string | null
  /** The time and zone that apply to this person. */
  time: string
  zone: string
}

type PersonDay = { day: string; workDay: boolean; dueAt: Date }

/** The person's own day at `at`: which day it is, whether it's a work day, and when they're due. */
export function personDay(clock: CheckinClock, at: Date): PersonDay {
  const local = localNow(at, clock.zone)
  return {
    day: local.day,
    workDay: clock.workDays.includes(local.weekday),
    dueAt: momentOf(local.day, clock.time, clock.zone),
  }
}

export function isLate(row: { checkedInAt: Date | null; dueAt: Date; workDay: boolean }) {
  return Boolean(row.checkedInAt) && row.workDay && row.checkedInAt! > row.dueAt
}

export async function loadClock(
  userId: string,
  database: ProjectDb = db
): Promise<{ membership: Membership; clock: CheckinClock }> {
  const membership = await requireMembership(userId, database)
  const [row] = await database
    .select({
      teamTime: projectTeams.checkinTime,
      teamZone: projectTeams.timeZone,
      workDays: projectTeams.workDays,
      ownTime: projectTeamMembers.checkinTime,
      ownZone: projectTeamMembers.timeZone,
    })
    .from(projectTeamMembers)
    .innerJoin(projectTeams, eq(projectTeams.id, projectTeamMembers.teamId))
    .where(eq(projectTeamMembers.userId, userId))
    .limit(1)
  if (!row) throw new Error(PROJECT_ERRORS.noTeam)
  return { membership, clock: clockOf(row) }
}

export function clockOf(row: {
  teamTime: string
  teamZone: string
  workDays: number[]
  ownTime: string | null
  ownZone: string | null
}): CheckinClock {
  return {
    ...row,
    workDays: [...row.workDays],
    time: row.ownTime ?? row.teamTime,
    zone: row.ownZone ?? row.teamZone,
  }
}

/**
 * Refuses a time zone the database doesn't know. The browser offers its own
 * list of zones, and the reminder job works out each person's day in Postgres,
 * which may know a slightly different list.
 */
export async function requireKnownZone(zone: string, database: ProjectDb = db) {
  const known = await database.execute(
    sql`SELECT 1 FROM pg_timezone_names WHERE name = ${zone} LIMIT 1`
  )
  if (known.rows.length === 0) throw new Error(PROJECT_ERRORS.unknownTimeZone)
}

/** Saves a person's own check-in time or zone. Null goes back to the team's. */
export async function setMyCheckinTime(
  userId: string,
  patch: { checkinTime?: string | null; timeZone?: string | null },
  database = db
) {
  const membership = await requireMembership(userId, database)
  if (patch.timeZone) await requireKnownZone(patch.timeZone, database)
  const fields: { checkinTime?: string | null; timeZone?: string | null } = {}
  if (patch.checkinTime !== undefined) fields.checkinTime = patch.checkinTime
  if (patch.timeZone !== undefined) fields.timeZone = patch.timeZone
  if (Object.keys(fields).length === 0) return
  await database
    .update(projectTeamMembers)
    .set(fields)
    .where(
      and(
        eq(projectTeamMembers.teamId, membership.teamId),
        eq(projectTeamMembers.userId, userId)
      )
    )
}

type ProjectRef = { id: string; name: string; color: ProjectColor }

export type CheckinAnswer = {
  taskId: string | null
  title: string
  action: "carry" | "drop"
  reason: string | null
}

export type CheckinPage = {
  clock: CheckinClock
  /** `pastDue`: checking in now would be marked late. `away`: the person's time off. */
  today: { day: string; workDay: boolean; dueAt: string; pastDue: boolean; away: boolean }
  /** Null until the person checks in today. */
  checkin: { checkedInAt: string; late: boolean } | null
  pickedTaskIds: string[]
  /** Before checking in: the last check-in's picks that aren't Done, to answer first. */
  leftovers: { day: string; tasks: TaskCard[] } | null
  /** After checking in: what this morning's check-in said about the last one's tasks. */
  answers: CheckinAnswer[]
  /** Today's three notes, empty until written. */
  notes: CheckinNotes
  /** The tasks to pick from: mine and not Done, plus anything already picked today. */
  groups: { project: ProjectRef; tasks: TaskCard[] }[]
  /** Open projects this person can add a task to. */
  projects: ProjectRef[]
}

export async function loadCheckinPage(
  userId: string,
  database = db,
  at = new Date()
): Promise<CheckinPage> {
  const { membership, clock } = await loadClock(userId, database)
  const today = await personWorkDay(userId, clock, at, database)
  const row = await findDay(userId, today.day, database)
  const checkedIn = Boolean(row?.checkedInAt)
  const items = row && checkedIn ? await itemsOf(row.id, database) : []
  const pickedTaskIds = items
    .filter((item) => item.kind === "pick" && item.taskId)
    .map((item) => item.taskId as string)

  const visible = await visibleProjectIds(membership, database)
  const leftovers = checkedIn ? null : await leftoversFor(userId, today.day, visible, database)
  const leftoverIds = new Set(leftovers?.tasks.map((task) => task.id))

  const projects = await database
    .select({
      id: projectProjects.id,
      name: projectProjects.name,
      color: projectProjects.color,
      archivedAt: projectProjects.archivedAt,
      personalUserId: projectProjects.personalUserId,
    })
    .from(projectProjects)
    .where(visibleProjectsWhere(membership))
    // Shared projects by name, then "Just me" last.
    .orderBy(sql`${projectProjects.personalUserId} IS NOT NULL`, asc(projectProjects.name))
  const openProjectIds = projects.filter((p) => !p.archivedAt).map((p) => p.id)

  // A snoozed task stays out of the pick list until the person's own morning
  // of its date.
  const mine = openProjectIds.length
    ? await listTaskCards(
        and(
          inArray(projectTasks.projectId, openProjectIds),
          eq(projectTasks.assigneeUserId, userId),
          ne(projectTasks.status, "done"),
          or(isNull(projectTasks.snoozedUntil), lte(projectTasks.snoozedUntil, today.day))
        ),
        database
      )
    : []
  const mineIds = new Set(mine.map((task) => task.id))
  const pickedElsewhere = pickedTaskIds.filter((id) => !mineIds.has(id))
  const extra = pickedElsewhere.length
    ? (await listTaskCards(inArray(projectTasks.id, pickedElsewhere), database)).filter((task) =>
        visible.has(task.projectId)
      )
    : []

  const byProject = new Map<string, { project: ProjectRef; tasks: TaskCard[] }>()
  for (const project of projects) {
    byProject.set(project.id, {
      project: { id: project.id, name: project.name, color: project.color },
      tasks: [],
    })
  }
  for (const task of [...mine, ...extra]) {
    if (leftoverIds.has(task.id)) continue
    byProject.get(task.projectId)?.tasks.push(task)
  }

  return {
    clock,
    today: {
      day: today.day,
      workDay: today.workDay,
      dueAt: today.dueAt.toISOString(),
      pastDue: today.workDay && at > today.dueAt,
      away: today.away,
    },
    checkin:
      row?.checkedInAt
        ? { checkedInAt: row.checkedInAt.toISOString(), late: isLate(row) }
        : null,
    pickedTaskIds,
    leftovers,
    answers: items
      .filter((item) => item.kind === "drop" || item.carriedOver)
      .map((item) => ({
        taskId: item.taskId,
        title: item.taskTitle,
        action: item.kind === "drop" ? "drop" : "carry",
        reason: item.reason,
      })),
    notes: notesOf(checkedIn ? row : null),
    groups: [...byProject.values()].filter((group) => group.tasks.length > 0),
    projects: [
      ...projects
        .filter((p) => !p.archivedAt)
        .map((p) => ({ id: p.id, name: p.name, color: p.color })),
      // "Just me" by its stand-in id until the person has used it once.
      ...(projects.some((p) => p.personalUserId)
        ? []
        : [{ id: PERSONAL_PROJECT_ID, name: PERSONAL_PROJECT_NAME, color: "slate" as const }]),
    ],
  }
}

/** A check-in row's notes, as the screens read them. */
export function notesOf(
  row: { noteYesterday: string | null; noteToday: string | null; noteBlocker: string | null } | null
): CheckinNotes {
  return {
    yesterday: row?.noteYesterday ?? null,
    today: row?.noteToday ?? null,
    blocker: row?.noteBlocker ?? null,
  }
}

/** The person's own day, with time off making a work day a day off. */
async function personWorkDay(userId: string, clock: CheckinClock, at: Date, database: ProjectDb) {
  const day = personDay(clock, at)
  const away = (await awayOn([userId], day.day, database)).has(userId)
  return { ...day, workDay: day.workDay && !away, away }
}

async function findDay(userId: string, day: string, database: ProjectDb) {
  const [row] = await database
    .select()
    .from(projectCheckins)
    .where(and(eq(projectCheckins.userId, userId), eq(projectCheckins.day, day)))
    .limit(1)
  return row ?? null
}

function itemsOf(checkinId: string, database: ProjectDb) {
  return database
    .select()
    .from(projectCheckinItems)
    .where(eq(projectCheckinItems.checkinId, checkinId))
    // Picks before drops when saved together, then by title, so the order holds.
    .orderBy(
      asc(projectCheckinItems.createdAt),
      desc(projectCheckinItems.kind),
      asc(projectCheckinItems.taskTitle)
    )
}

/**
 * The last check-in before today, and its picks that still need an answer:
 * not Done, not deleted, and in an open project the person can still see. A
 * task in an archived project can't be carried over, so it isn't asked about.
 */
async function leftoversFor(
  userId: string,
  today: string,
  visible: Set<string>,
  database: ProjectDb
): Promise<{ day: string; tasks: TaskCard[] } | null> {
  const [last] = await database
    .select({ id: projectCheckins.id, day: projectCheckins.day })
    .from(projectCheckins)
    .where(
      and(
        eq(projectCheckins.userId, userId),
        lt(projectCheckins.day, today),
        isNotNull(projectCheckins.checkedInAt)
      )
    )
    .orderBy(desc(projectCheckins.day))
    .limit(1)
  if (!last) return null
  const picks = await database
    .select({ taskId: projectCheckinItems.taskId })
    .from(projectCheckinItems)
    .where(
      and(
        eq(projectCheckinItems.checkinId, last.id),
        eq(projectCheckinItems.kind, "pick"),
        isNotNull(projectCheckinItems.taskId)
      )
    )
  const ids = picks.map((pick) => pick.taskId as string)
  if (ids.length === 0) return null
  const tasks = (
    await listTaskCards(
      and(
        inArray(projectTasks.id, ids),
        ne(projectTasks.status, "done"),
        isNull(projectProjects.archivedAt)
      ),
      database
    )
  ).filter((task) => visible.has(task.projectId))
  return tasks.length ? { day: last.day, tasks } : null
}

/**
 * Saves today's check-in: an answer for every leftover, and today's picks.
 * A carried-over task becomes one of today's picks.
 */
export async function submitCheckin(
  userId: string,
  input: {
    answers: (
      | { taskId: string; action: "carry" }
      | { taskId: string; action: "drop"; reason: string }
    )[]
    picks: string[]
    notes?: CheckinNotes
  },
  database = db,
  at = new Date()
) {
  const notes = {
    noteYesterday: input.notes?.yesterday ?? null,
    noteToday: input.notes?.today ?? null,
    noteBlocker: input.notes?.blocker ?? null,
  }
  await database.transaction(async (tx) => {
    const { membership, clock } = await loadClock(userId, tx)
    // A check-in on time off is saved as a day off, so it is never late.
    const today = await personWorkDay(userId, clock, at, tx)
    const existing = await findDay(userId, today.day, tx)
    if (existing?.checkedInAt) throw new Error(PROJECT_ERRORS.alreadyCheckedIn)

    const visible = await visibleProjectIds(membership, tx)
    const leftovers = await leftoversFor(userId, today.day, visible, tx)
    const leftoverIds = new Set(leftovers?.tasks.map((task) => task.id))
    // An answer about a task that has since been finished or taken away is
    // dropped quietly; every task still left over needs one.
    const answers = input.answers.filter((answer) => leftoverIds.has(answer.taskId))
    const answered = new Set(answers.map((answer) => answer.taskId))
    if (answered.size !== answers.length || answered.size !== leftoverIds.size) {
      throw new Error(PROJECT_ERRORS.answerEveryLeftover)
    }

    const dropped = new Set(
      answers.filter((answer) => answer.action === "drop").map((a) => a.taskId)
    )
    const carried = answers
      .filter((answer) => answer.action === "carry")
      .map((answer) => answer.taskId)
    const fresh = [...new Set(input.picks)].filter((id) => !carried.includes(id))
    if (fresh.some((id) => dropped.has(id))) throw new Error(PROJECT_ERRORS.pickedAndDropped)
    if (carried.length + fresh.length > LIMITS.picksPerDay) {
      throw new Error(PROJECT_ERRORS.tooManyPicks)
    }

    const pickable = await pickableTasks(userId, [...carried, ...fresh], tx)
    const leftoverById = new Map(leftovers?.tasks.map((task) => [task.id, task]))

    // A row with no check-in can already exist for today when the person
    // moved their time zone back onto a day the end-of-day job had saved as
    // missed. It becomes today's check-in.
    const [checkin] = await tx
      .insert(projectCheckins)
      .values({
        id: uuid(),
        teamId: membership.teamId,
        userId,
        day: today.day,
        timeZone: clock.zone,
        workDay: today.workDay,
        dueAt: today.dueAt,
        checkedInAt: at,
        closedAt: null,
        createdAt: at,
        ...notes,
      })
      .onConflictDoUpdate({
        target: [projectCheckins.userId, projectCheckins.day],
        set: {
          timeZone: clock.zone,
          workDay: today.workDay,
          dueAt: today.dueAt,
          checkedInAt: at,
          closedAt: null,
          ...notes,
        },
        setWhere: isNull(projectCheckins.checkedInAt),
      })
      .returning({ id: projectCheckins.id })
    if (!checkin) throw new Error(PROJECT_ERRORS.alreadyCheckedIn)

    const rows = [
      ...carried.map((taskId) => ({ task: pickable.get(taskId)!, kind: "pick" as const, carriedOver: true, reason: null })),
      ...fresh.map((taskId) => ({ task: pickable.get(taskId)!, kind: "pick" as const, carriedOver: false, reason: null })),
      ...answers
        .filter((answer) => answer.action === "drop")
        .map((answer) => ({
          task: leftoverById.get(answer.taskId)!,
          kind: "drop" as const,
          carriedOver: false,
          reason: "reason" in answer ? answer.reason : null,
        })),
    ]
    if (rows.length) {
      await tx.insert(projectCheckinItems).values(
        rows.map((row) => ({
          id: uuid(),
          checkinId: checkin.id,
          taskId: row.task.id,
          projectId: row.task.projectId,
          taskTitle: row.task.title,
          kind: row.kind,
          carriedOver: row.carriedOver,
          reason: row.reason,
          endStatus: null,
          createdAt: at,
        }))
      )
    }
  })
}

/**
 * Tasks a person may pick: ones they can see in an open project, and not
 * Done. A task that isn't theirs is allowed, because a carried-over task may
 * have been handed on since.
 */
async function pickableTasks(userId: string, taskIds: string[], database: ProjectDb) {
  const found = new Map<string, { id: string; projectId: string; title: string }>()
  for (const taskId of taskIds) {
    const { task } = await requireTaskAccess(userId, taskId, database)
    if (task.status === "done") throw new Error(PROJECT_ERRORS.taskAlreadyDone)
    found.set(task.id, { id: task.id, projectId: task.projectId, title: task.title })
  }
  return found
}

async function requireCheckedInToday(userId: string, database: ProjectDb, at: Date) {
  const { clock } = await loadClock(userId, database)
  const today = personDay(clock, at)
  const row = await findDay(userId, today.day, database)
  if (!row?.checkedInAt) throw new Error(PROJECT_ERRORS.notCheckedIn)
  return row
}

/** Adds a task to today's picks, after checking in. */
export async function addPick(userId: string, taskId: string, database = db, at = new Date()) {
  await database.transaction(async (tx) => {
    const checkin = await requireCheckedInToday(userId, tx, at)
    const task = (await pickableTasks(userId, [taskId], tx)).get(taskId)!
    const picks = await tx
      .select({ taskId: projectCheckinItems.taskId })
      .from(projectCheckinItems)
      .where(and(eq(projectCheckinItems.checkinId, checkin.id), eq(projectCheckinItems.kind, "pick")))
    if (picks.some((pick) => pick.taskId === taskId)) return
    if (picks.length >= LIMITS.picksPerDay) throw new Error(PROJECT_ERRORS.tooManyPicks)
    // A task dropped this morning and picked again later becomes a carry-over:
    // the person changed their mind, so the drop no longer stands.
    await tx
      .insert(projectCheckinItems)
      .values({
        id: uuid(),
        checkinId: checkin.id,
        taskId: task.id,
        projectId: task.projectId,
        taskTitle: task.title,
        kind: "pick",
        carriedOver: false,
        reason: null,
        endStatus: null,
        createdAt: at,
      })
      .onConflictDoUpdate({
        target: [projectCheckinItems.checkinId, projectCheckinItems.taskId],
        set: { kind: "pick", carriedOver: true, reason: null },
      })
  })
}

/**
 * Changes today's notes after checking in. They save as they are typed, and
 * only today's: a past day keeps what it said.
 */
export async function saveCheckinNotes(
  userId: string,
  notes: CheckinNotes,
  database = db,
  at = new Date()
) {
  const checkin = await requireCheckedInToday(userId, database, at)
  await database
    .update(projectCheckins)
    .set({ noteYesterday: notes.yesterday, noteToday: notes.today, noteBlocker: notes.blocker })
    .where(eq(projectCheckins.id, checkin.id))
}

/** Takes a task off today's picks. */
export async function removePick(userId: string, taskId: string, database = db, at = new Date()) {
  const checkin = await requireCheckedInToday(userId, database, at)
  await database
    .delete(projectCheckinItems)
    .where(
      and(
        eq(projectCheckinItems.checkinId, checkin.id),
        eq(projectCheckinItems.taskId, taskId),
        eq(projectCheckinItems.kind, "pick")
      )
    )
}
