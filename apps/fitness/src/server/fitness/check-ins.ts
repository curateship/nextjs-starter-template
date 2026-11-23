import { and, desc, eq, isNotNull, isNull } from "drizzle-orm"

import { checkInWeek } from "@/lib/fitness/check-in"
import type { Day } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { canReachPerson, type FitnessDb } from "@/server/fitness/access"
import { loadAppSettings } from "@/server/fitness/app-settings"
import { todayFor } from "@/server/fitness/calendar"
import { sendFitnessNotice } from "@/server/fitness/notices"
import { saveWeighIn } from "@/server/fitness/progress"
import { fitnessCheckIns, fitnessCoachClients, fitnessWeighIns } from "@/server/fitness/schema"
import { customShellUsers } from "@/server/schema"

/**
 * The weekly check-in (Tyler, 21 Oct 2026). Only a person with a coach who
 * said yes gets it. It is asked on Sundays by the reminders job, answered from
 * the Programs dashboard, and read by the coach on the client's Programs
 * dashboard. One per person per week: sending again replaces the first.
 */

export type CheckIn = {
  id: string
  week: Day
  weightKg: number | null
  sleep: number | null
  stress: number | null
  training: number | null
  note: string
  sentAt: string
}

/** The coaches who said yes to this person, for the notices. A deleted coach's account is left out. */
async function acceptedCoaches(clientId: string, database: FitnessDb) {
  return database
    .select({ coachId: fitnessCoachClients.coachUserId })
    .from(fitnessCoachClients)
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessCoachClients.coachUserId))
    .where(
      and(
        eq(fitnessCoachClients.clientUserId, clientId),
        isNotNull(fitnessCoachClients.acceptedAt),
        isNull(customShellUsers.deletedAt)
      )
    )
}

/** Whether the person owes this week's check-in, and which week it is for. */
export async function checkInDue(userId: string, database: FitnessDb = db): Promise<{ week: Day } | null> {
  // With the switch off on the Reminders tab, nobody is asked, on the dashboard or in the bell.
  if (!(await loadAppSettings(database)).reminders.checkInOn) return null
  if ((await acceptedCoaches(userId, database)).length === 0) return null
  const week = checkInWeek(await todayFor(userId, database))
  const [sent] = await database
    .select({ id: fitnessCheckIns.id })
    .from(fitnessCheckIns)
    .where(and(eq(fitnessCheckIns.userId, userId), eq(fitnessCheckIns.week, week)))
    .limit(1)
  return sent ? null : { week }
}

/**
 * Saves the week's check-in. The bodyweight goes in as today's weigh-in, so
 * the bodyweight line moves too. Each of the person's coaches gets a notice
 * the first time it's sent that week.
 */
export async function saveCheckIn(
  userId: string,
  input: {
    weightKg: number | null
    sleep: number | null
    stress: number | null
    training: number | null
    note: string
  },
  database: FitnessDb = db
) {
  const coaches = await acceptedCoaches(userId, database)
  if (coaches.length === 0) throw new Error(FITNESS_ERRORS.checkInNoCoach)
  const today = await todayFor(userId, database)
  const week = checkInWeek(today)
  if (input.weightKg !== null) await saveWeighIn(userId, { day: today, weightKg: input.weightKg }, database)
  const row = {
    sleep: input.sleep,
    stress: input.stress,
    training: input.training,
    note: input.note.trim(),
    weighInDay: input.weightKg !== null ? today : null,
    sentAt: now(),
  }
  // The insert decides which send is the week's first, so two sends at the same moment tell the coaches once.
  const inserted = await database
    .insert(fitnessCheckIns)
    .values({ id: uuid(), userId, week, ...row })
    .onConflictDoNothing({ target: [fitnessCheckIns.userId, fitnessCheckIns.week] })
    .returning({ id: fitnessCheckIns.id })
  if (inserted.length === 0) {
    // Sending again replaces the week's answers; the coaches were told the first time.
    await database
      .update(fitnessCheckIns)
      .set(row)
      .where(and(eq(fitnessCheckIns.userId, userId), eq(fitnessCheckIns.week, week)))
    return
  }
  const [person] = await database
    .select({ name: customShellUsers.name })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)
  for (const { coachId } of coaches) {
    await sendFitnessNotice(
      {
        recipientUserId: coachId,
        actorUserId: userId,
        kind: "checkin",
        message: `${person?.name ?? "A client"} sent their check-in`,
        detail: "Read it on their Programs dashboard.",
        href: `/programs?person=${userId}`,
      },
      database
    )
  }
}

/** A person's check-ins, newest first, for the client themselves or a coach they said yes to. */
export async function listCheckIns(
  actorId: string,
  personId: string,
  database: FitnessDb = db,
  { limit = 12 }: { limit?: number } = {}
): Promise<CheckIn[]> {
  if (!(await canReachPerson(actorId, personId, database))) throw new Error(FITNESS_ERRORS.notYourClient)
  const rows = await database
    .select({
      id: fitnessCheckIns.id,
      week: fitnessCheckIns.week,
      sleep: fitnessCheckIns.sleep,
      stress: fitnessCheckIns.stress,
      training: fitnessCheckIns.training,
      note: fitnessCheckIns.note,
      sentAt: fitnessCheckIns.sentAt,
      weightKg: fitnessWeighIns.weightKg,
    })
    .from(fitnessCheckIns)
    .leftJoin(
      fitnessWeighIns,
      and(eq(fitnessWeighIns.userId, fitnessCheckIns.userId), eq(fitnessWeighIns.day, fitnessCheckIns.weighInDay))
    )
    .where(eq(fitnessCheckIns.userId, personId))
    .orderBy(desc(fitnessCheckIns.week))
    .limit(limit)
  return rows.map((row) => ({ ...row, weightKg: row.weightKg ?? null, sentAt: row.sentAt.toISOString() }))
}

/**
 * The coach has read this client's check-ins, which takes the New mark off
 * the Clients table. Sent once the Check-ins card is on screen, never by a
 * page load, so a preloaded page can't clear it unread.
 */
export async function markCheckInsSeen(coachId: string, clientId: string, database: FitnessDb = db) {
  await database
    .update(fitnessCoachClients)
    .set({ checkInsSeenAt: now() })
    .where(and(eq(fitnessCoachClients.coachUserId, coachId), eq(fitnessCoachClients.clientUserId, clientId)))
}
