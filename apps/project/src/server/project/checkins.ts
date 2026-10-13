import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, max, ne, or, sql } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { localNow, momentOf } from "@/lib/project/days"
import {
  LIMITS,
  PERSONAL_PROJECT_ID,
  PERSONAL_PROJECT_NAME,
  checkinQuestions,
  priorityRank,
  type CheckinNotes,
  type CheckinQuestions,
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
import { requireTeamTags, tellNewlyTagged } from "@/server/project/checkin-mentions"
import { holidayOn } from "@/server/project/holidays"
import {
  projectCheckinItems,
  projectCheckins,
  projectProjects,
  projectTasks,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { listTaskCards, setTaskStatus, type Actor, type TaskCard } from "@/server/project/tasks"
import { awayOn } from "@/server/project/time-off"
import { customShellUsers } from "@/server/schema"

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
  /**
   * `pastDue`: checking in now would be marked late. `away`: the person's time
   * off. `holiday`: the team's holiday's name.
   */
  today: {
    day: string
    workDay: boolean
    dueAt: string
    pastDue: boolean
    away: boolean
    holiday: string | null
  }
  /** Null until the person checks in today. */
  checkin: { checkedInAt: string; late: boolean } | null
  /** Today's picks, in the person's own order. */
  pickedTaskIds: string[]
  /** Before checking in: the last check-in's picks that aren't Done, to answer first. */
  leftovers: { day: string; tasks: TaskCard[] } | null
  /** After checking in: what this morning's check-in said about the last one's tasks. */
  answers: CheckinAnswer[]
  /**
   * Today's three notes. Before checking in, the Yesterday box starts from the
   * last check-out's "What's left", for the person to change.
   */
  notes: CheckinNotes
  /** The words the team's three boxes have now. */
  questions: CheckinQuestions
  /** Everyone on the team, who a note can tag with @. */
  people: { id: string; name: string; avatarUrl: string }[]
  /** Today's optional check-out, once checked in. Only the person sees it. */
  checkout: { at: string | null; noteLeft: string | null } | null
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
  const today = await personWorkDay(userId, membership.teamId, clock, at, database)
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
  // High first within each project, then the project's own order.
  const byPriority = [...mine, ...extra].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
  for (const task of byPriority) {
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
      holiday: today.holiday,
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
    notes: checkedIn
      ? notesOf(row)
      : { yesterday: await lastNoteLeft(userId, today.day, database), today: null, blocker: null },
    questions: await teamQuestions(membership.teamId, database),
    people: await teamPeople(membership.teamId, database),
    checkout: checkedIn ? { at: row!.checkedOutAt?.toISOString() ?? null, noteLeft: row!.noteLeft } : null,
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

/** The person's own day, with time off or a team holiday making a work day a day off. */
async function personWorkDay(
  userId: string,
  teamId: string,
  clock: CheckinClock,
  at: Date,
  database: ProjectDb
) {
  const day = personDay(clock, at)
  const away = (await awayOn([userId], day.day, database)).has(userId)
  const holiday = await holidayOn(teamId, day.day, database)
  return { ...day, workDay: day.workDay && !away && !holiday, away, holiday }
}

/** The words the team's three boxes have now. */
export async function teamQuestions(teamId: string, database: ProjectDb): Promise<CheckinQuestions> {
  const [team] = await database
    .select({
      yesterday: projectTeams.questionYesterday,
      today: projectTeams.questionToday,
      blocker: projectTeams.questionBlocker,
    })
    .from(projectTeams)
    .where(eq(projectTeams.id, teamId))
  return checkinQuestions(team ?? { yesterday: null, today: null, blocker: null })
}

async function teamPeople(teamId: string, database: ProjectDb) {
  const rows = await database
    .select({ id: customShellUsers.id, name: customShellUsers.name, avatarUrl: customShellUsers.avatarUrl })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(eq(projectTeamMembers.teamId, teamId))
    .orderBy(asc(customShellUsers.name))
  return rows.map((row) => ({ ...row, avatarUrl: row.avatarUrl ?? "" }))
}

/** The last check-out's "What's left", which starts the next check-in's Yesterday box. */
async function lastNoteLeft(userId: string, today: string, database: ProjectDb) {
  const [last] = await database
    .select({ noteLeft: projectCheckins.noteLeft })
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
  return last?.noteLeft ?? null
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
    // The person's own order first. Picks come before drops when saved
    // together, then by title, so the order holds.
    .orderBy(
      sql`${projectCheckinItems.position} ASC NULLS LAST`,
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
  const picks = (await itemsOf(last.id, database)).filter(
    (item) => item.kind === "pick" && item.taskId
  )
  const ids = picks.map((pick) => pick.taskId as string)
  if (ids.length === 0) return null
  // In the order the person had them, so carrying them over keeps it.
  const tasks = (
    await listTaskCards(
      and(
        inArray(projectTasks.id, ids),
        ne(projectTasks.status, "done"),
        isNull(projectProjects.archivedAt)
      ),
      database
    )
  )
    .filter((task) => visible.has(task.projectId))
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
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
    // A check-in on time off or a holiday is saved as a day off, so it is never late.
    const today = await personWorkDay(userId, membership.teamId, clock, at, tx)
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
    const tags = await requireTeamTags(membership.teamId, input.notes ?? notesOf(null), tx)
    // The words the boxes have today, so this day reads under them later.
    const words = await teamQuestions(membership.teamId, tx)
    const questionLabels = [words.yesterday, words.today, words.blocker]

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
        questionLabels,
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
          questionLabels,
          ...notes,
        },
        setWhere: isNull(projectCheckins.checkedInAt),
      })
      .returning({ id: projectCheckins.id })
    if (!checkin) throw new Error(PROJECT_ERRORS.alreadyCheckedIn)

    // Carried-over tasks keep the last check-in's order, then today's ticks in the order ticked.
    const carriedInOrder = (leftovers?.tasks ?? [])
      .map((task) => task.id)
      .filter((id) => carried.includes(id))
    const rows = [
      ...carriedInOrder.map((taskId) => ({ task: pickable.get(taskId)!, kind: "pick" as const, carriedOver: true, reason: null })),
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
        rows.map((row, index) => ({
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
          position: row.kind === "pick" ? index : null,
        }))
      )
    }
    await tellNewlyTagged(
      { id: checkin.id, userId, day: today.day },
      input.notes ?? notesOf(null),
      tags,
      tx
    )
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
    // A task added later in the day goes to the bottom of the person's order.
    const [{ last }] = await tx
      .select({ last: max(projectCheckinItems.position) })
      .from(projectCheckinItems)
      .where(eq(projectCheckinItems.checkinId, checkin.id))
    const position = (last ?? picks.length - 1) + 1
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
        position,
      })
      .onConflictDoUpdate({
        target: [projectCheckinItems.checkinId, projectCheckinItems.taskId],
        set: { kind: "pick", carriedOver: true, reason: null, position },
      })
  })
}

/**
 * Changes today's notes after checking in. They save as they are typed, and
 * only today's: a past day keeps what it said.
 */
export async function saveCheckinNotes(
  userId: string,
  notes: CheckinNotes & {
    /** Set once a box is left: only then are newly tagged people told. */
    notify?: boolean
  },
  database = db,
  at = new Date()
) {
  await database.transaction(async (tx) => {
    const checkin = await requireCheckedInToday(userId, tx, at)
    const tags = await requireTeamTags(checkin.teamId, notes, tx)
    await tx
      .update(projectCheckins)
      .set({ noteYesterday: notes.yesterday, noteToday: notes.today, noteBlocker: notes.blocker })
      .where(eq(projectCheckins.id, checkin.id))
    if (notes.notify) await tellNewlyTagged(checkin, notes, tags, tx)
  })
}

/** Puts today's picks in the person's own order. Nobody else's view changes. */
export async function orderTodaysPicks(
  userId: string,
  taskIds: string[],
  database = db,
  at = new Date()
) {
  await database.transaction(async (tx) => {
    const checkin = await requireCheckedInToday(userId, tx, at)
    const picks = await tx
      .select({ id: projectCheckinItems.id, taskId: projectCheckinItems.taskId })
      .from(projectCheckinItems)
      .where(and(eq(projectCheckinItems.checkinId, checkin.id), eq(projectCheckinItems.kind, "pick")))
    const byTask = new Map(picks.map((pick) => [pick.taskId, pick.id]))
    const unique = [...new Set(taskIds)]
    if (unique.length !== taskIds.length || unique.some((id) => !byTask.has(id))) {
      throw new Error(PROJECT_ERRORS.notTodaysPicks)
    }
    // Picks not named keep their place after the named ones.
    const rest = picks.filter((pick) => pick.taskId && !unique.includes(pick.taskId))
    const order = [...unique.map((id) => byTask.get(id)!), ...rest.map((pick) => pick.id)]
    for (const [position, id] of order.entries()) {
      await tx.update(projectCheckinItems).set({ position }).where(eq(projectCheckinItems.id, id))
    }
  })
}

/**
 * The optional evening check-out: marks the picks the person finished Done,
 * one at a time as from the task itself, and keeps "What's left" for the next
 * check-in's Yesterday box. Never needed to check in tomorrow, and nobody
 * else ever sees it.
 */
export async function checkOut(
  actor: Actor,
  input: { doneTaskIds: string[]; noteLeft: string | null },
  database = db,
  at = new Date()
) {
  // All or nothing: a pick that can't be marked Done leaves the rest as they were.
  await database.transaction(async (tx) => {
    const checkin = await requireCheckedInToday(actor.id, tx, at)
    const picks = await tx
      .select({ taskId: projectCheckinItems.taskId, status: projectTasks.status })
      .from(projectCheckinItems)
      .innerJoin(projectTasks, eq(projectTasks.id, projectCheckinItems.taskId))
      .where(and(eq(projectCheckinItems.checkinId, checkin.id), eq(projectCheckinItems.kind, "pick")))
    const statusOf = new Map(picks.map((pick) => [pick.taskId, pick.status]))
    if (input.doneTaskIds.some((id) => !statusOf.has(id))) throw new Error(PROJECT_ERRORS.notTodaysPicks)
    for (const taskId of new Set(input.doneTaskIds)) {
      if (statusOf.get(taskId) === "done") continue
      await setTaskStatus(actor, { taskId, status: "done", stuckReason: null }, tx)
    }
    await tx
      .update(projectCheckins)
      .set({ checkedOutAt: at, noteLeft: input.noteLeft })
      .where(eq(projectCheckins.id, checkin.id))
  })
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
