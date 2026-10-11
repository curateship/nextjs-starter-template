import { and, asc, count, eq, inArray } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { addDays, clockLabel, localNow, momentOf, shortDayLabel } from "@/lib/project/days"
import {
  meetingDaysBetween,
  meetingHref,
  monthGrid,
  videoServiceName,
} from "@/lib/project/meetings"
import { meetingInviteHeading } from "@/lib/project/notices"
import {
  LIMITS,
  runsTheTeam,
  type MeetingRepeat,
  type ProjectColor,
} from "@/lib/project/rules"
import { RateLimitError, enforceRateLimit } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireMembership, type Membership, type ProjectDb } from "@/server/project/access"
import { clockOf, loadClock, personDay } from "@/server/project/checkins"
import { writeAppNotices } from "@/server/project/notices"
import {
  projectMeetingPeople,
  projectMeetings,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Meetings on the Team dashboard's calendar. Tyler's rules (11 Oct 2026):
 *
 * - A meeting belongs to the team, and everyone on the team sees it.
 * - Anyone on the team makes one. Only its maker, the owner and admins
 *   change or delete it.
 * - It repeats every week, every two weeks, or not at all.
 * - People added to it get one bell notice. There is no reminder before it.
 * - Its times are set in the team's time zone. Each person sees them in their
 *   own time.
 */

export type MeetingInput = {
  title: string
  color: ProjectColor
  day: string
  startTime: string
  endTime: string
  repeatEvery: MeetingRepeat | null
  videoUrl: string | null
  peopleIds: string[]
}

export type MeetingPerson = { id: string; name: string; avatarUrl: string }

export type Meeting = {
  id: string
  title: string
  color: ProjectColor
  /** The first day, in the meeting's own zone. */
  day: string
  startTime: string
  endTime: string
  timeZone: string
  repeatEvery: MeetingRepeat | null
  videoUrl: string | null
  /** "Google Meet", "Zoom", or the link's site. Null with no link. */
  service: string | null
  people: MeetingPerson[]
  canEdit: boolean
}

export type MeetingOccurrence = {
  meetingId: string
  /** The viewer's own day it falls on. */
  day: string
  startsAt: string
  endsAt: string
}

export type TeamMeetings = {
  /** The zone the viewer's times are shown in. */
  viewerZone: string
  /** The zone a new meeting is set in. */
  teamZone: string
  meetings: Meeting[]
  /** Every meeting on the month's grid and on the chosen day, by start time. */
  occurrences: MeetingOccurrence[]
}

type MeetingRow = typeof projectMeetings.$inferSelect

/**
 * Saves of meetings per person per hour. Each save can ring up to 50 bells,
 * so without a cap one person could make and delete meetings in a loop and
 * fill everyone's bell. A small team plans a week in far fewer.
 */
export const MEETING_SAVES = { maxAttempts: 60, windowSeconds: 60 * 60 } as const

async function countMeetingSave(userId: string, database: typeof db) {
  try {
    await enforceRateLimit(`project-meeting-save:${userId}`, MEETING_SAVES, database)
  } catch (error) {
    if (error instanceof RateLimitError) throw new Error(PROJECT_ERRORS.tooManyMeetingSaves)
    throw error
  }
}

/** When one day of a meeting starts and ends. */
function momentsOf(meeting: Pick<MeetingRow, "startTime" | "endTime" | "timeZone">, day: string) {
  return {
    startsAt: momentOf(day, meeting.startTime, meeting.timeZone),
    endsAt: momentOf(day, meeting.endTime, meeting.timeZone),
  }
}

/**
 * Each time a meeting falls on a viewer's day from `from` to `to`. The
 * meeting's own calendar is read a day wider on each side, because a meeting
 * late on Monday in Toronto is already Tuesday in Berlin.
 */
function occurrencesBetween(
  meeting: MeetingRow,
  viewerZone: string,
  from: string,
  to: string
): MeetingOccurrence[] {
  return meetingDaysBetween(meeting, addDays(from, -1), addDays(to, 1)).flatMap((ownDay) => {
    const { startsAt, endsAt } = momentsOf(meeting, ownDay)
    const day = localNow(startsAt, viewerZone).day
    if (day < from || day > to) return []
    return [{ meetingId: meeting.id, day, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }]
  })
}

export async function loadTeamMeetings(
  viewerId: string,
  shown: { month?: string; day?: string },
  database = db,
  at = new Date()
): Promise<TeamMeetings> {
  const { membership, clock } = await loadClock(viewerId, database)
  const today = personDay(clock, at).day
  const grid = monthGrid(shown.month ?? today.slice(0, 7))
  const selected = shown.day ?? today

  const [team] = await database
    .select({ timeZone: projectTeams.timeZone })
    .from(projectTeams)
    .where(eq(projectTeams.id, membership.teamId))
  const rows = await database
    .select()
    .from(projectMeetings)
    .where(eq(projectMeetings.teamId, membership.teamId))
    .orderBy(asc(projectMeetings.startTime), asc(projectMeetings.title))
  const people = await peopleOf(membership.teamId, rows.map((row) => row.id), database)

  const occurrences = rows.flatMap((row) => [
    ...occurrencesBetween(row, clock.zone, grid.start, grid.end),
    ...(selected < grid.start || selected > grid.end
      ? occurrencesBetween(row, clock.zone, selected, selected)
      : []),
  ])
  occurrences.sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  return {
    viewerZone: clock.zone,
    teamZone: team?.timeZone ?? clock.teamZone,
    meetings: rows.map((row) => ({
      id: row.id,
      title: row.title,
      color: row.color,
      day: row.day,
      startTime: row.startTime,
      endTime: row.endTime,
      timeZone: row.timeZone,
      repeatEvery: row.repeatEvery,
      videoUrl: row.videoUrl,
      service: videoServiceName(row.videoUrl),
      people: people.get(row.id) ?? [],
      canEdit: mayChange(membership, row),
    })),
    occurrences,
  }
}

/** The people invited to each meeting who are still on the team. */
async function peopleOf(teamId: string, meetingIds: string[], database: ProjectDb) {
  const byMeeting = new Map<string, MeetingPerson[]>()
  if (meetingIds.length === 0) return byMeeting
  const rows = await database
    .select({
      meetingId: projectMeetingPeople.meetingId,
      id: customShellUsers.id,
      name: customShellUsers.name,
      avatarUrl: customShellUsers.avatarUrl,
    })
    .from(projectMeetingPeople)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectMeetingPeople.userId))
    .innerJoin(
      projectTeamMembers,
      and(
        eq(projectTeamMembers.userId, projectMeetingPeople.userId),
        eq(projectTeamMembers.teamId, teamId)
      )
    )
    .where(inArray(projectMeetingPeople.meetingId, meetingIds))
    .orderBy(asc(customShellUsers.name))
  for (const row of rows) {
    const list = byMeeting.get(row.meetingId) ?? []
    list.push({ id: row.id, name: row.name, avatarUrl: row.avatarUrl ?? "" })
    byMeeting.set(row.meetingId, list)
  }
  return byMeeting
}

function mayChange(membership: Membership, meeting: Pick<MeetingRow, "createdByUserId">) {
  return meeting.createdByUserId === membership.userId || runsTheTeam(membership.role)
}

/** Every person named must be on the actor's team. */
async function requireTeammates(teamId: string, userIds: string[], database: ProjectDb) {
  if (userIds.length === 0) return
  const found = await database
    .select({ userId: projectTeamMembers.userId })
    .from(projectTeamMembers)
    .where(and(eq(projectTeamMembers.teamId, teamId), inArray(projectTeamMembers.userId, userIds)))
  if (found.length !== userIds.length) throw new Error(PROJECT_ERRORS.personNotOnTeam)
}

async function requireMeeting(membership: Membership, meetingId: string, database: ProjectDb) {
  const [meeting] = await database
    .select()
    .from(projectMeetings)
    .where(and(eq(projectMeetings.id, meetingId), eq(projectMeetings.teamId, membership.teamId)))
    .limit(1)
  if (!meeting) throw new Error(PROJECT_ERRORS.meetingNotFound)
  if (!mayChange(membership, meeting)) throw new Error(PROJECT_ERRORS.cantChangeMeeting)
  return meeting
}

export async function createMeeting(
  actor: { id: string; name: string },
  input: MeetingInput,
  database = db,
  at = new Date()
): Promise<{ id: string }> {
  await countMeetingSave(actor.id, database)
  return database.transaction(async (tx) => {
    const membership = await requireMembership(actor.id, tx)
    const [{ total }] = await tx
      .select({ total: count() })
      .from(projectMeetings)
      .where(eq(projectMeetings.teamId, membership.teamId))
    if (total >= LIMITS.meetingsPerTeam) throw new Error(PROJECT_ERRORS.tooManyMeetings)
    await requireTeammates(membership.teamId, input.peopleIds, tx)
    const [team] = await tx
      .select({ timeZone: projectTeams.timeZone })
      .from(projectTeams)
      .where(eq(projectTeams.id, membership.teamId))

    const meeting = {
      id: uuid(),
      teamId: membership.teamId,
      title: input.title,
      color: input.color,
      day: input.day,
      startTime: input.startTime,
      endTime: input.endTime,
      timeZone: team.timeZone,
      repeatEvery: input.repeatEvery,
      videoUrl: input.videoUrl,
      createdByUserId: actor.id,
      createdAt: now(),
      updatedAt: now(),
    }
    await tx.insert(projectMeetings).values(meeting)
    if (input.peopleIds.length) {
      await tx
        .insert(projectMeetingPeople)
        .values(input.peopleIds.map((userId) => ({ meetingId: meeting.id, userId })))
    }
    await tellInvited(tx, actor, meeting, input.peopleIds, at)
    return { id: meeting.id }
  })
}

/**
 * Changes a meeting. Its times stay in the zone it was set in, which the
 * window shows. Only people newly added hear about it.
 */
export async function updateMeeting(
  actor: { id: string; name: string },
  meetingId: string,
  input: MeetingInput,
  database = db,
  at = new Date()
) {
  await countMeetingSave(actor.id, database)
  await database.transaction(async (tx) => {
    const membership = await requireMembership(actor.id, tx)
    const meeting = await requireMeeting(membership, meetingId, tx)
    await requireTeammates(membership.teamId, input.peopleIds, tx)
    const before = await tx
      .select({ userId: projectMeetingPeople.userId })
      .from(projectMeetingPeople)
      .where(eq(projectMeetingPeople.meetingId, meetingId))
    const already = new Set(before.map((row) => row.userId))

    const changes = {
      title: input.title,
      color: input.color,
      day: input.day,
      startTime: input.startTime,
      endTime: input.endTime,
      repeatEvery: input.repeatEvery,
      videoUrl: input.videoUrl,
      updatedAt: now(),
    }
    await tx.update(projectMeetings).set(changes).where(eq(projectMeetings.id, meetingId))
    await tx.delete(projectMeetingPeople).where(eq(projectMeetingPeople.meetingId, meetingId))
    if (input.peopleIds.length) {
      await tx
        .insert(projectMeetingPeople)
        .values(input.peopleIds.map((userId) => ({ meetingId, userId })))
    }
    await tellInvited(
      tx,
      actor,
      { ...meeting, ...changes },
      input.peopleIds.filter((userId) => !already.has(userId)),
      at
    )
  })
}

/** Deletes a meeting and every one of its repeats. */
export async function deleteMeeting(userId: string, meetingId: string, database = db) {
  await database.transaction(async (tx) => {
    const membership = await requireMembership(userId, tx)
    await requireMeeting(membership, meetingId, tx)
    await tx.delete(projectMeetings).where(eq(projectMeetings.id, meetingId))
  })
}

/**
 * One bell notice for each person added, saying when the meeting next falls
 * in their own time, and opening the Team dashboard on that day.
 */
async function tellInvited(
  tx: ProjectDb,
  actor: { id: string; name: string },
  meeting: MeetingRow,
  userIds: string[],
  at: Date
) {
  const others = userIds.filter((userId) => userId !== actor.id)
  if (others.length === 0) return
  const clocks = await tx
    .select({
      userId: projectTeamMembers.userId,
      teamTime: projectTeams.checkinTime,
      teamZone: projectTeams.timeZone,
      workDays: projectTeams.workDays,
      ownTime: projectTeamMembers.checkinTime,
      ownZone: projectTeamMembers.timeZone,
    })
    .from(projectTeamMembers)
    .innerJoin(projectTeams, eq(projectTeams.id, projectTeamMembers.teamId))
    .where(and(eq(projectTeamMembers.teamId, meeting.teamId), inArray(projectTeamMembers.userId, others)))

  const ownDay = nextDayOf(meeting, at)
  const { startsAt } = momentsOf(meeting, ownDay)
  const repeats = meeting.repeatEvery === "week" ? ", every week" : meeting.repeatEvery === "two_weeks" ? ", every 2 weeks" : ""
  await writeAppNotices(
    tx,
    clocks.map((row) => {
      const local = localNow(startsAt, clockOf(row).zone)
      return {
        kind: "meeting_invite" as const,
        recipientUserId: row.userId,
        actorUserId: actor.id,
        message: meetingInviteHeading(actor.name),
        detail: `${meeting.title} · ${shortDayLabel(local.day)}, ${clockLabel(local.time)}${repeats}`,
        href: meetingHref(local.day),
      }
    })
  )
}

/** The meeting's next day that hasn't ended, or its only day when it has. */
function nextDayOf(meeting: MeetingRow, at: Date) {
  const today = localNow(at, meeting.timeZone).day
  const ahead = meetingDaysBetween(meeting, today, addDays(today, 15))
  return ahead.find((day) => momentsOf(meeting, day).endsAt > at) ?? ahead[0] ?? meeting.day
}
