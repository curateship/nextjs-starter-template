import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import { addDays, todayIn, weekStart, type Day } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import type { FitnessDb } from "@/server/fitness/access"
import { loadAppSettings } from "@/server/fitness/app-settings"
import { sendFitnessNotice } from "@/server/fitness/notices"
import {
  fitnessCheckIns,
  fitnessCoachClients,
  fitnessProfiles,
  fitnessPrograms,
  fitnessScheduledWorkouts,
  fitnessWorkouts,
} from "@/server/fitness/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Coaches and their clients.
 *
 * - A coach is an account with the app's `coach` role. The site admin makes
 *   one on Admin, Users.
 * - A coach asks a client by email. The client must already have an account,
 *   and sees the request on their Programs dashboard. Nothing is shared until
 *   they say yes.
 * - Once linked, the coach can build and change the client's programs and read
 *   their workouts and charts. Photos stay hidden until the client switches
 *   them on for that coach.
 * - Either side can end it at any time, and access stops straight away.
 */

export const COACH_ROLE = "coach"

async function requireCoach(userId: string, database: FitnessDb) {
  const [user] = await database
    .select({ role: customShellUsers.role })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)
  if (user?.role !== COACH_ROLE) throw new Error(FITNESS_ERRORS.notACoach)
}

export type CoachClient = {
  userId: string
  name: string
  email: string
  accepted: boolean
  photosAllowed: boolean
  /** How the client is training, for a client who said yes; null while the request waits. */
  overview: ClientOverview | null
}

export type ClientOverview = {
  lastWorkout: { name: string; day: Day } | null
  /** Finished workouts this week, Monday to Sunday on the client's clock. */
  thisWeek: number
  /** The weekly goal, less any day the client skipped on purpose this week. */
  goal: number
  /** Planned workouts earlier this week that nobody logged or skipped. */
  missed: number
  lastCheckIn: { week: Day; sentAt: string } | null
  /** A check-in sent since the coach last opened the client's check-ins. */
  checkInUnread: boolean
}

export async function listClients(coachId: string, database: FitnessDb = db): Promise<CoachClient[]> {
  await requireCoach(coachId, database)
  const rows = await database
    .select({
      userId: customShellUsers.id,
      name: customShellUsers.name,
      email: customShellUsers.email,
      acceptedAt: fitnessCoachClients.acceptedAt,
      photosAllowed: fitnessCoachClients.photosAllowed,
      checkInsSeenAt: fitnessCoachClients.checkInsSeenAt,
    })
    .from(fitnessCoachClients)
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessCoachClients.clientUserId))
    .where(eq(fitnessCoachClients.coachUserId, coachId))
    .orderBy(sql`lower(${customShellUsers.name})`)
  const overviews = await clientOverviews(
    rows.filter((row) => row.acceptedAt).map((row) => ({ userId: row.userId, seenAt: row.checkInsSeenAt })),
    database
  )
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    accepted: Boolean(row.acceptedAt),
    photosAllowed: row.photosAllowed && Boolean(row.acceptedAt),
    overview: overviews.get(row.userId) ?? null,
  }))
}

/**
 * The Clients table's figures for every linked client at once: a fixed
 * handful of queries however many clients there are, never one per client.
 * "This week" runs on each client's own clock and counts every program, the
 * same as the client's own weekly goal.
 */
async function clientOverviews(
  clients: { userId: string; seenAt: Date | null }[],
  database: FitnessDb
): Promise<Map<string, ClientOverview>> {
  const result = new Map<string, ClientOverview>()
  if (clients.length === 0) return result
  const ids = clients.map((client) => client.userId)
  const [settings, zones] = await Promise.all([
    loadAppSettings(database),
    database
      .select({ userId: fitnessProfiles.userId, timeZone: fitnessProfiles.timeZone })
      .from(fitnessProfiles)
      .where(inArray(fitnessProfiles.userId, ids)),
  ])
  const todayOf = new Map(ids.map((id) => [id, todayIn(zones.find((zone) => zone.userId === id)?.timeZone)]))
  // Eight days back covers this week's Monday on any clock.
  const earliest = addDays(todayIn(), -8)
  const [lastWorkouts, recentWorkouts, recentDates, checkIns] = await Promise.all([
    database
      .selectDistinctOn([fitnessWorkouts.userId], {
        userId: fitnessWorkouts.userId,
        name: fitnessWorkouts.name,
        day: fitnessWorkouts.day,
      })
      .from(fitnessWorkouts)
      .where(and(inArray(fitnessWorkouts.userId, ids), isNotNull(fitnessWorkouts.finishedAt)))
      .orderBy(fitnessWorkouts.userId, desc(fitnessWorkouts.day), desc(fitnessWorkouts.finishedAt)),
    database
      .select({ userId: fitnessWorkouts.userId, day: fitnessWorkouts.day })
      .from(fitnessWorkouts)
      .where(
        and(
          inArray(fitnessWorkouts.userId, ids),
          isNotNull(fitnessWorkouts.finishedAt),
          gte(fitnessWorkouts.day, earliest)
        )
      ),
    database
      .select({
        userId: fitnessPrograms.userId,
        day: fitnessScheduledWorkouts.day,
        status: fitnessScheduledWorkouts.status,
        skippedAt: fitnessScheduledWorkouts.skippedAt,
        isActive: fitnessPrograms.isActive,
      })
      .from(fitnessScheduledWorkouts)
      .innerJoin(fitnessPrograms, eq(fitnessPrograms.id, fitnessScheduledWorkouts.programId))
      .where(
        and(
          inArray(fitnessPrograms.userId, ids),
          isNull(fitnessPrograms.archivedAt),
          gte(fitnessScheduledWorkouts.day, earliest)
        )
      ),
    database
      .selectDistinctOn([fitnessCheckIns.userId], {
        userId: fitnessCheckIns.userId,
        week: fitnessCheckIns.week,
        sentAt: fitnessCheckIns.sentAt,
      })
      .from(fitnessCheckIns)
      .where(inArray(fitnessCheckIns.userId, ids))
      .orderBy(fitnessCheckIns.userId, desc(fitnessCheckIns.week)),
  ])
  for (const client of clients) {
    const today = todayOf.get(client.userId) as Day
    const monday = weekStart(today)
    const inWeek = (day: Day) => day >= monday && day <= addDays(monday, 6)
    const dates = recentDates.filter((row) => row.userId === client.userId && inWeek(row.day))
    const last = lastWorkouts.find((row) => row.userId === client.userId)
    const checkIn = checkIns.find((row) => row.userId === client.userId)
    result.set(client.userId, {
      lastWorkout: last ? { name: last.name, day: last.day } : null,
      thisWeek: recentWorkouts.filter((row) => row.userId === client.userId && inWeek(row.day)).length,
      goal: Math.max(0, settings.workouts.weeklyGoal - dates.filter((row) => row.skippedAt).length),
      missed: dates.filter(
        (row) => row.isActive && row.status === "planned" && !row.skippedAt && row.day < today
      ).length,
      lastCheckIn: checkIn ? { week: checkIn.week, sentAt: checkIn.sentAt.toISOString() } : null,
      checkInUnread: Boolean(checkIn && (!client.seenAt || checkIn.sentAt > client.seenAt)),
    })
  }
  return result
}

/** The clients who said yes, by name, for picking one to copy a program to. */
export async function linkedClients(coachId: string, database: FitnessDb = db) {
  await requireCoach(coachId, database)
  return database
    .select({ userId: customShellUsers.id, name: customShellUsers.name })
    .from(fitnessCoachClients)
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessCoachClients.clientUserId))
    .where(and(eq(fitnessCoachClients.coachUserId, coachId), isNotNull(fitnessCoachClients.acceptedAt)))
    .orderBy(sql`lower(${customShellUsers.name})`)
}

/** Asks someone with an account to be coached. They say yes or no on their Programs dashboard. */
export async function inviteClient(coachId: string, email: string, database: FitnessDb = db) {
  await requireCoach(coachId, database)
  const [client] = await database
    .select({ id: customShellUsers.id, role: customShellUsers.role, deletedAt: customShellUsers.deletedAt })
    .from(customShellUsers)
    .where(eq(sql`lower(${customShellUsers.email})`, email.trim().toLowerCase()))
    .limit(1)
  if (!client || client.deletedAt || client.role === COACH_ROLE) throw new Error(FITNESS_ERRORS.clientNotMember)
  if (client.id === coachId) throw new Error(FITNESS_ERRORS.clientIsYou)
  const inserted = await database
    .insert(fitnessCoachClients)
    .values({ coachUserId: coachId, clientUserId: client.id, photosAllowed: false, acceptedAt: null, createdAt: now() })
    .onConflictDoNothing()
    .returning({ clientUserId: fitnessCoachClients.clientUserId })
  if (inserted.length > 0) {
    const [coach] = await database
      .select({ name: customShellUsers.name })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, coachId))
      .limit(1)
    await sendFitnessNotice(
      {
        recipientUserId: client.id,
        actorUserId: coachId,
        kind: "coach",
        message: `${coach?.name ?? "A coach"} wants to coach you`,
        detail: "Say yes or no on your Programs dashboard.",
        href: "/programs",
      },
      database
    )
  }
}

/** Ends a link from the coach's side. */
/** Ends the coach's links to these clients in one go; an id the coach isn't linked to is kept and counted. */
export async function removeClients(coachId: string, clientIds: string[], database: FitnessDb = db) {
  await requireCoach(coachId, database)
  const removed = await database
    .delete(fitnessCoachClients)
    .where(and(eq(fitnessCoachClients.coachUserId, coachId), inArray(fitnessCoachClients.clientUserId, clientIds)))
    .returning({ id: fitnessCoachClients.clientUserId })
  const done = removed.map((row) => row.id)
  return { done, kept: clientIds.filter((clientId) => !done.includes(clientId)) }
}

export type MyCoach = { coachId: string; name: string; accepted: boolean; photosAllowed: boolean }

/** The coaches linked to a person, and the ones still waiting for an answer. */
export async function listMyCoaches(clientId: string, database: FitnessDb = db): Promise<MyCoach[]> {
  const rows = await database
    .select({
      coachId: fitnessCoachClients.coachUserId,
      name: customShellUsers.name,
      acceptedAt: fitnessCoachClients.acceptedAt,
      photosAllowed: fitnessCoachClients.photosAllowed,
    })
    .from(fitnessCoachClients)
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessCoachClients.coachUserId))
    .where(eq(fitnessCoachClients.clientUserId, clientId))
  return rows.map((row) => ({
    coachId: row.coachId,
    name: row.name,
    accepted: Boolean(row.acceptedAt),
    photosAllowed: row.photosAllowed,
  }))
}

export async function answerCoach(clientId: string, coachId: string, accept: boolean, database: FitnessDb = db) {
  if (!accept) {
    await database
      .delete(fitnessCoachClients)
      .where(and(eq(fitnessCoachClients.coachUserId, coachId), eq(fitnessCoachClients.clientUserId, clientId)))
    return
  }
  const updated = await database
    .update(fitnessCoachClients)
    .set({ acceptedAt: now() })
    .where(
      and(
        eq(fitnessCoachClients.coachUserId, coachId),
        eq(fitnessCoachClients.clientUserId, clientId),
        isNull(fitnessCoachClients.acceptedAt)
      )
    )
    .returning({ coachId: fitnessCoachClients.coachUserId })
  if (updated.length === 0) throw new Error(FITNESS_ERRORS.coachNotFound)
}

/** The client's switch for whether this coach may see their before and after photos. */
export async function setCoachPhotos(clientId: string, coachId: string, allowed: boolean, database: FitnessDb = db) {
  const updated = await database
    .update(fitnessCoachClients)
    .set({ photosAllowed: allowed })
    .where(
      and(
        eq(fitnessCoachClients.coachUserId, coachId),
        eq(fitnessCoachClients.clientUserId, clientId),
        isNotNull(fitnessCoachClients.acceptedAt)
      )
    )
    .returning({ coachId: fitnessCoachClients.coachUserId })
  if (updated.length === 0) throw new Error(FITNESS_ERRORS.coachNotFound)
}

/** Ends a link from the client's side. */
export async function removeCoach(clientId: string, coachId: string, database: FitnessDb = db) {
  await database
    .delete(fitnessCoachClients)
    .where(and(eq(fitnessCoachClients.coachUserId, coachId), eq(fitnessCoachClients.clientUserId, clientId)))
}

/** The client's name, for a coach's header, once they are linked. */
export async function clientName(coachId: string, clientId: string, database: FitnessDb = db) {
  const [row] = await database
    .select({ name: customShellUsers.name })
    .from(fitnessCoachClients)
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessCoachClients.clientUserId))
    .where(
      and(
        eq(fitnessCoachClients.coachUserId, coachId),
        eq(fitnessCoachClients.clientUserId, clientId),
        isNotNull(fitnessCoachClients.acceptedAt)
      )
    )
    .limit(1)
  if (!row) throw new Error(FITNESS_ERRORS.notYourClient)
  return row.name
}
