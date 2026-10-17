import { and, count, eq, gte, inArray, isNotNull, isNull, lte, max, ne, sql } from "drizzle-orm"

import { matchesClient } from "@/lib/project/clients"
import { addDays, localNow, weekdayOf } from "@/lib/project/days"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { teamJoinedHeading, MEMBERS_HREF, onTeamHref } from "@/lib/project/notices"
import {
  INVITE_LIFETIME_DAYS,
  JOINS_PER_LINK_PER_DAY,
  PICKED_MANY_DAYS,
  runsTheTeam,
} from "@/lib/project/rules"
import { appUrlFor } from "@/server/app-url"
import { RateLimitError, enforceRateLimit } from "@/server/auth/rate-limit"
import { createSecretToken, hashToken, now } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  isProjectMember,
  requireMembership,
  requireTeamRunner,
  siteAdminIds,
  visibleProjectsWhere,
  type Membership,
  type ProjectDb,
} from "@/server/project/access"
import { writeAppNotices, writeTaskNotices } from "@/server/project/notices"
import { clockOf, personDay } from "@/server/project/checkins"
import {
  projectProjects,
  projectTaskEvents,
  projectTasks,
  projectTeamJoins,
  projectTeamMembers,
  projectTeams,
  projectTimeOff,
} from "@/server/project/schema"
import { addEmployee } from "@/server/project/invites"
import { assignTask, listTaskCards, type Actor, type TaskCard } from "@/server/project/tasks"
import { clearAssignee } from "@/server/project/teams"
import { customShellUsers } from "@/server/schema"

/**
 * What the person running the team needs: tasks that need help, who has room
 * for more work, handing all of one person's tasks on, a link to join the
 * team, and a job title for each member.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** The team's shared, open projects that this person can see. */
function sharedOpenProjects(membership: Membership) {
  return and(
    visibleProjectsWhere(membership),
    isNull(projectProjects.personalUserId),
    isNull(projectProjects.archivedAt)
  )
}

/** Open tasks in the team's shared, open projects that this person can see. */
async function openTeamTasks(membership: Membership, database: ProjectDb) {
  return listTaskCards(and(sharedOpenProjects(membership), ne(projectTasks.status, "done")), database)
}

/** Done tasks still waiting for their reviewer, with when the wait began. */
async function tasksWaitingForReview(membership: Membership, database: ProjectDb) {
  const cards = await listTaskCards(
    and(sharedOpenProjects(membership), eq(projectTasks.status, "done"), isNotNull(projectTasks.reviewWaitingSince)),
    database
  )
  if (cards.length === 0) return []
  const since = new Map(
    (
      await database
        .select({ id: projectTasks.id, since: projectTasks.reviewWaitingSince })
        .from(projectTasks)
        .where(inArray(projectTasks.id, cards.map((card) => card.id)))
    ).map((row) => [row.id, row.since!])
  )
  return cards.map((card) => ({ card, since: since.get(card.id)! }))
}

async function teamToday(teamId: string, database: ProjectDb, at: Date) {
  const [team] = await database
    .select({ zone: projectTeams.timeZone, workDays: projectTeams.workDays })
    .from(projectTeams)
    .where(eq(projectTeams.id, teamId))
  return {
    zone: team.zone,
    workDays: [...team.workDays],
    today: localNow(at, team.zone).day,
  }
}

/** The latest moment of one kind for each task, from the history rows. */
async function latestEvents(
  taskIds: string[],
  kind: "status_changed" | "handed_over",
  database: ProjectDb,
  reason?: string
) {
  if (taskIds.length === 0) return new Map<string, Date>()
  const rows = await database
    .select({ taskId: projectTaskEvents.taskId, at: max(projectTaskEvents.createdAt) })
    .from(projectTaskEvents)
    .where(
      and(
        inArray(projectTaskEvents.taskId, taskIds),
        eq(projectTaskEvents.kind, kind),
        reason ? eq(projectTaskEvents.reason, reason) : undefined
      )
    )
    .groupBy(projectTaskEvents.taskId)
  return new Map(rows.filter((row) => row.at).map((row) => [row.taskId, row.at as Date]))
}

export type AttentionKind = "stuck" | "not_accepted" | "review_waiting" | "picked_many" | "overdue"

export type AttentionRow = {
  kind: AttentionKind
  taskId: string
  title: string
  projectName: string
  personName: string | null
  /** Who should review it, for a task waiting for review; null for every other kind. */
  reviewerName: string | null
  /** "Stuck for 3 days", "Not accepted for 2 work days", "Picked on 5 days", "4 days overdue". */
  howLong: string
  /** How many days, for ordering the longest first. */
  days: number
}

/**
 * Every task that needs help, in one list, for the owner and admins: Stuck
 * (from the day it is marked), handed over and not accepted after a work
 * day, Done and waiting for its review after a work day, picked on 3 or more
 * days and not Done, and overdue. A task that is fixed leaves
 * the list, because it is worked out again on every read.
 *
 * How long a task has been Stuck or waiting is read from its history rows.
 * A task that became Stuck or was handed over before those were written down
 * counts from its last change or from when it was made.
 */
export async function loadNeedsAttention(
  viewerId: string,
  database = db,
  at = new Date()
): Promise<AttentionRow[]> {
  const membership = await requireTeamRunner(viewerId, database)
  const tasks = await openTeamTasks(membership, database)
  const { today, workDays, zone } = await teamToday(membership.teamId, database, at)
  const ids = tasks.map((task) => task.id)
  const stuckSince = await latestEvents(ids, "status_changed", database, "stuck")
  const handedAt = await latestEvents(ids, "handed_over", database)
  const changed = ids.length
    ? new Map(
        (
          await database
            .select({ id: projectTasks.id, updatedAt: projectTasks.updatedAt, createdAt: projectTasks.createdAt })
            .from(projectTasks)
            .where(inArray(projectTasks.id, ids))
        ).map((row) => [row.id, row])
      )
    : new Map<string, { updatedAt: Date; createdAt: Date }>()

  const dayOf = (moment: Date) => localNow(moment, zone).day
  const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
  const workDaysAfter = (from: string) => {
    let total = 0
    for (let day = addDays(from, 1); day <= today; day = addDays(day, 1)) {
      if (workDays.includes(weekdayOf(day))) total += 1
    }
    return total
  }
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`

  const rows: AttentionRow[] = []
  const row = (task: TaskCard, kind: AttentionKind, howLong: string, days: number): AttentionRow => ({
    kind,
    taskId: task.id,
    title: task.title,
    projectName: task.projectName,
    personName: task.assignee?.name ?? null,
    reviewerName: kind === "review_waiting" ? (task.review.reviewer?.name ?? null) : null,
    howLong,
    days,
  })

  for (const task of tasks) {
    const times = changed.get(task.id)!
    if (task.status === "stuck") {
      // Shown the day it is marked Stuck: someone can't carry on (Tyler, 11 Oct 2026).
      const days = daysBetween(dayOf(stuckSince.get(task.id) ?? times.updatedAt), today)
      rows.push(row(task, "stuck", days ? `Stuck for ${plural(days, "day")}` : "Stuck since today", days))
    }
    if (task.waiting) {
      const since = dayOf(handedAt.get(task.id) ?? times.createdAt)
      const waited = workDaysAfter(since)
      if (waited >= 1) {
        rows.push(row(task, "not_accepted", `Not accepted for ${plural(waited, "work day")}`, waited))
      }
    }
    if (task.pickedDays >= PICKED_MANY_DAYS) {
      rows.push(row(task, "picked_many", `Picked on ${task.pickedDays} days`, task.pickedDays))
    }
    if (task.dueDate && task.dueDate < today) {
      const days = daysBetween(task.dueDate, today)
      rows.push(row(task, "overdue", `${plural(days, "day")} overdue`, days))
    }
  }
  // Shown after a work day of waiting, like a task not accepted (Tyler, 16 Oct 2026).
  for (const { card, since } of await tasksWaitingForReview(membership, database)) {
    const waited = workDaysAfter(dayOf(since))
    if (waited < 1) continue
    const reviewer = card.review.reviewer ? `${card.review.reviewer.name}'s review` : "review"
    rows.push(row(card, "review_waiting", `Waiting for ${reviewer} for ${plural(waited, "work day")}`, waited))
  }
  return rows.sort((a, b) => b.days - a.days)
}

export type WorkloadBucket = "open" | "doing" | "stuck" | "overdue" | "week"

type WorkloadTask = { id: string; title: string; projectName: string }

export type WorkloadRow = {
  person: { id: string; name: string; avatarUrl: string; title: string | null }
  counts: Record<WorkloadBucket, number>
  tasks: Record<WorkloadBucket, WorkloadTask[]>
}

/**
 * Each member's open work across every project the viewer can see: open,
 * Doing, Stuck, overdue and due in the next seven days (today included).
 * The owner and admins see everything, as elsewhere; everyone else sees only
 * what's in their own projects. "Just me" tasks never count. With a client
 * picked, only that client's projects count.
 */
export async function loadWorkload(
  viewerId: string,
  database = db,
  at = new Date(),
  client?: string
): Promise<WorkloadRow[]> {
  const membership = await requireMembership(viewerId, database)
  const all = await openTeamTasks(membership, database)
  // One client's work only, when one is picked (Features 16 Oct, part 9).
  const tasks = client ? all.filter((task) => matchesClient(task.projectClient, client)) : all
  const { today } = await teamToday(membership.teamId, database, at)
  const weekEnd = addDays(today, 7)
  const people = await database
    .select({
      id: projectTeamMembers.userId,
      name: customShellUsers.name,
      avatarUrl: customShellUsers.avatarUrl,
      title: projectTeamMembers.title,
    })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(eq(projectTeamMembers.teamId, membership.teamId))

  const inBucket: Record<WorkloadBucket, (task: TaskCard) => boolean> = {
    open: () => true,
    doing: (task) => task.status === "doing",
    stuck: (task) => task.status === "stuck",
    overdue: (task) => Boolean(task.dueDate && task.dueDate < today),
    week: (task) => Boolean(task.dueDate && task.dueDate >= today && task.dueDate <= weekEnd),
  }
  const buckets = Object.keys(inBucket) as WorkloadBucket[]
  return people
    .map((person) => {
      const theirs = tasks.filter((task) => task.assignee?.id === person.id)
      const lists = Object.fromEntries(
        buckets.map((bucket) => [
          bucket,
          theirs
            .filter(inBucket[bucket])
            .map((task) => ({ id: task.id, title: task.title, projectName: task.projectName })),
        ])
      ) as Record<WorkloadBucket, WorkloadTask[]>
      return {
        person: { ...person, avatarUrl: person.avatarUrl ?? "" },
        counts: Object.fromEntries(buckets.map((b) => [b, lists[b].length])) as Record<WorkloadBucket, number>,
        tasks: lists,
      }
    })
    .sort((a, b) => b.counts.open - a.counts.open || a.person.name.localeCompare(b.person.name))
}

export type PersonRoom = {
  /** Open tasks, counted exactly as the Workload tab counts them for this viewer. */
  open: number
  /** The last day of time off that covers the person's own today, or null. */
  awayUntil: string | null
}

/**
 * Who has room, for every hand-to picker: each teammate's open tasks and
 * whether they're away today. The counts are the Workload tab's for the same
 * viewer, so a member counts only what's in their own projects. Only the
 * dates of time off show, never a reason. Handing to someone away is still
 * allowed.
 */
export async function loadPeopleRoom(
  viewerId: string,
  database = db,
  at = new Date()
): Promise<Record<string, PersonRoom>> {
  const membership = await requireMembership(viewerId, database)
  const people = await database
    .select({
      id: projectTeamMembers.userId,
      teamTime: projectTeams.checkinTime,
      teamZone: projectTeams.timeZone,
      workDays: projectTeams.workDays,
      ownTime: projectTeamMembers.checkinTime,
      ownZone: projectTeamMembers.timeZone,
    })
    .from(projectTeamMembers)
    .innerJoin(projectTeams, eq(projectTeams.id, projectTeamMembers.teamId))
    .where(eq(projectTeamMembers.teamId, membership.teamId))
  const counts = await database
    .select({ userId: projectTasks.assigneeUserId, open: count() })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(
      and(
        visibleProjectsWhere(membership),
        isNull(projectProjects.personalUserId),
        isNull(projectProjects.archivedAt),
        isNull(projectTasks.deletedAt),
        ne(projectTasks.status, "done")
      )
    )
    .groupBy(projectTasks.assigneeUserId)
  const todayOf = new Map(people.map((person) => [person.id, personDay(clockOf(person), at).day]))
  const days = [...todayOf.values()].sort()
  const offs = days.length
    ? await database
        .select({ userId: projectTimeOff.userId, firstDay: projectTimeOff.firstDay, lastDay: projectTimeOff.lastDay })
        .from(projectTimeOff)
        .where(
          and(
            eq(projectTimeOff.teamId, membership.teamId),
            lte(projectTimeOff.firstDay, days[days.length - 1]),
            gte(projectTimeOff.lastDay, days[0])
          )
        )
    : []
  return Object.fromEntries(
    people.map((person) => {
      const today = todayOf.get(person.id)!
      const covering = offs
        .filter((off) => off.userId === person.id && off.firstDay <= today && off.lastDay >= today)
        .map((off) => off.lastDay)
        .sort()
      return [
        person.id,
        {
          open: counts.find((row) => row.userId === person.id)?.open ?? 0,
          awayUntil: covering.at(-1) ?? null,
        },
      ]
    })
  )
}

export type HandOverOutcome = {
  handed: { id: string; title: string }[]
  /** Left with nobody assigned, because the receiver isn't on the project. */
  left: { id: string; title: string; projectName: string }[]
}

/**
 * Hands every open task of one person to another, for when someone leaves or
 * goes away. Each hand-over goes through `assignTask`, so it writes history
 * and leaves the task Waiting for the receiver, who gets one notice with the
 * count rather than one per task. A task in a project the receiver isn't on
 * is left with nobody assigned (Tyler's choice: the receiver is never added
 * to projects) and listed with the reason. Tasks in archived projects and
 * "Just me" tasks stay as they are.
 */
export async function handOverAllTasks(
  actor: Actor,
  input: { fromUserId: string; toUserId: string; note?: string | null },
  database = db
): Promise<HandOverOutcome> {
  const membership = await requireTeamRunner(actor.id, database)
  if (input.fromUserId === input.toUserId) throw new Error(PROJECT_ERRORS.handOverToSelf)
  const teammates = await database
    .select({ userId: projectTeamMembers.userId, name: customShellUsers.name })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(
      and(
        eq(projectTeamMembers.teamId, membership.teamId),
        inArray(projectTeamMembers.userId, [input.fromUserId, input.toUserId])
      )
    )
  if (teammates.length !== 2) throw new Error(PROJECT_ERRORS.personNotOnTeam)
  const fromName = teammates.find((t) => t.userId === input.fromUserId)!.name

  return database.transaction(async (tx) => {
    const tasks = await listTaskCards(
      and(
        eq(projectProjects.teamId, membership.teamId),
        isNull(projectProjects.personalUserId),
        isNull(projectProjects.archivedAt),
        eq(projectTasks.assigneeUserId, input.fromUserId),
        ne(projectTasks.status, "done")
      ),
      tx
    )
    const outcome: HandOverOutcome = { handed: [], left: [] }
    for (const task of tasks) {
      if (await isProjectMember(task.projectId, input.toUserId, tx)) {
        await assignTask(
          actor,
          { taskId: task.id, assigneeUserId: input.toUserId, note: input.note },
          tx,
          { notify: false }
        )
        outcome.handed.push({ id: task.id, title: task.title })
      } else {
        await clearAssignee(input.fromUserId, eq(projectTasks.id, task.id), tx)
        outcome.left.push({ id: task.id, title: task.title, projectName: task.projectName })
      }
    }
    if (outcome.handed.length && input.toUserId !== actor.id) {
      const first = tasks.find((task) => task.id === outcome.handed[0].id)!
      await writeTaskNotices(tx, [
        {
          kind: outcome.handed.length === 1 ? "task_assigned" : "tasks_handed",
          recipientUserId: input.toUserId,
          actor,
          // One task opens that task; several open My dashboard.
          task: { id: first.id, projectId: first.projectId, title: first.title },
          extra: null,
          count: outcome.handed.length,
          // The note rides along, as on a single hand-over.
          detail:
            outcome.handed.length === 1
              ? input.note
                ? `${first.title}: ${input.note}`
                : first.title
              : `From ${fromName}: ${titlesLine(outcome.handed.map((t) => t.title))}${input.note ? `. ${input.note}` : ""}`,
        },
      ])
    }
    return outcome
  })
}

function titlesLine(titles: string[]) {
  const shown = titles.slice(0, 2)
  const rest = titles.length - shown.length
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(" and ")
}

export type JoinLinkState = { on: boolean; expiresAt: string | null; expired: boolean }

export async function joinLinkState(teamId: string, database: ProjectDb = db): Promise<JoinLinkState> {
  const [team] = await database
    .select({ hash: projectTeams.joinTokenHash, expiresAt: projectTeams.joinExpiresAt })
    .from(projectTeams)
    .where(eq(projectTeams.id, teamId))
  const on = Boolean(team?.hash)
  return {
    on,
    expiresAt: on ? (team!.expiresAt?.toISOString() ?? null) : null,
    expired: on && Boolean(team!.expiresAt && team!.expiresAt <= now()),
  }
}

/**
 * Turns the join link on, or makes a fresh one. Only a fingerprint of its
 * secret is kept, so the link is shown this once. A fresh link stops the old
 * one at once. It works for 7 days.
 */
export async function makeJoinLink(actorId: string, database = db) {
  const membership = await requireTeamRunner(actorId, database)
  const token = createSecretToken()
  const expiresAt = new Date(now().getTime() + INVITE_LIFETIME_DAYS * DAY_MS)
  await database
    .update(projectTeams)
    .set({ joinTokenHash: hashToken(token), joinExpiresAt: expiresAt, updatedAt: now() })
    .where(eq(projectTeams.id, membership.teamId))
  return {
    link: appUrlFor(`/join/${encodeURIComponent(token)}`),
    expiresAt: expiresAt.toISOString(),
  }
}

export async function turnOffJoinLink(actorId: string, database = db) {
  const membership = await requireTeamRunner(actorId, database)
  await database
    .update(projectTeams)
    .set({ joinTokenHash: null, joinExpiresAt: null, updatedAt: now() })
    .where(eq(projectTeams.id, membership.teamId))
}

export type JoinOffer = {
  teamName: string
  /** Why nobody can join through it right now, or null when they can. */
  blocker: "expired" | null
}

/** The team behind a join link. Null for a link that was reset or turned off. */
export async function loadJoinOffer(token: string, database = db): Promise<JoinOffer | null> {
  const [team] = await database
    .select({ name: projectTeams.name, expiresAt: projectTeams.joinExpiresAt })
    .from(projectTeams)
    .where(eq(projectTeams.joinTokenHash, hashToken(token)))
  if (!team) return null
  return { teamName: team.name, blocker: team.expiresAt && team.expiresAt <= now() ? "expired" : null }
}

/**
 * Joins the team behind a link, straight away (Tyler's choice: no approval).
 * Whoever opens it is signed out: they type their name and email, become an
 * employee on the team, and get the "Set your password" email. An address
 * that already has an account is refused, so a link can't move somebody
 * else's account onto a team. Capped per link per day, so a link that leaks
 * can't fill the team, and the site admin hears about each join in the bell.
 */
export async function joinTeamByLink(
  person: { name: string; email: string },
  token: string,
  database = db
): Promise<{ emailed: boolean }> {
  const name = person.name.trim()
  if (!name) throw new Error(PROJECT_ERRORS.joinNeedsName)
  const email = person.email.trim().toLowerCase()
  const hash = hashToken(token)
  const [team] = await database
    .select({ id: projectTeams.id, expiresAt: projectTeams.joinExpiresAt })
    .from(projectTeams)
    .where(eq(projectTeams.joinTokenHash, hash))
  if (!team) throw new Error(PROJECT_ERRORS.joinLinkNotFound)
  if (team.expiresAt && team.expiresAt <= now()) throw new Error(PROJECT_ERRORS.joinLinkExpired)
  if (await accountExists(email, database)) throw new Error(PROJECT_ERRORS.joinEmailTaken)
  // The day's cap is claimed in one statement, so two people joining at the
  // same moment can't both slip past it.
  try {
    await enforceRateLimit(
      `project-join-link:${hash}`,
      { maxAttempts: JOINS_PER_LINK_PER_DAY, windowSeconds: DAY_MS / 1000 },
      database
    )
  } catch (error) {
    if (error instanceof RateLimitError) throw new Error(PROJECT_ERRORS.joinLinkBusy)
    throw error
  }

  const sent = await addEmployee(
    { email, name, teamId: team.id },
    { inviterName: name, workspaceId: null },
    database
  )
  await database.transaction(async (tx) => {
    await tx
      .insert(projectTeamJoins)
      .values({ teamId: team.id, userId: sent.userId, tokenHash: hash, joinedAt: now() })
    await writeAppNotices(
      tx,
      (await siteAdminIds(tx)).map((adminId) => ({
        kind: "team_joined",
        recipientUserId: adminId,
        message: teamJoinedHeading(name),
        detail: "They're on the team now and will set their password from their email.",
        href: onTeamHref(team.id, MEMBERS_HREF),
      }))
    )
  })
  return { emailed: sent.emailed }
}

async function accountExists(email: string, database: ProjectDb) {
  const [row] = await database
    .select({ id: customShellUsers.id })
    .from(customShellUsers)
    .where(eq(sql`lower(${customShellUsers.email})`, email))
    .limit(1)
  return Boolean(row)
}

/** A member's job title: their own, or anyone's for the site admin. */
export async function setMemberTitle(
  actorId: string,
  input: { userId?: string; title: string | null },
  database = db
) {
  const membership = await requireMembership(actorId, database)
  const target = input.userId ?? actorId
  if (target !== actorId && !runsTheTeam(membership.role)) throw new Error(PROJECT_ERRORS.notRunningTeam)
  const updated = await database
    .update(projectTeamMembers)
    .set({ title: input.title?.trim() || null })
    .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, target)))
    .returning({ userId: projectTeamMembers.userId })
  if (!updated.length) throw new Error(PROJECT_ERRORS.personNotOnTeam)
}
