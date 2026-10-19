import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import type { FitnessDb } from "@/server/fitness/access"
import { sendFitnessNotice } from "@/server/fitness/notices"
import { fitnessCoachClients } from "@/server/fitness/schema"
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
    })
    .from(fitnessCoachClients)
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessCoachClients.clientUserId))
    .where(eq(fitnessCoachClients.coachUserId, coachId))
    .orderBy(sql`lower(${customShellUsers.name})`)
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    accepted: Boolean(row.acceptedAt),
    photosAllowed: row.photosAllowed && Boolean(row.acceptedAt),
  }))
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
