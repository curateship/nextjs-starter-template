import { and, eq, isNotNull } from "drizzle-orm"

import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { db, type CustomShellDb } from "@/server/db"
import { fitnessCoachClients, fitnessPrograms } from "@/server/fitness/schema"

/**
 * Who may see what. Every Fitness endpoint goes through one of these before it
 * reads or writes, so nobody reaches another person's programs, workouts or
 * photos by guessing an id.
 *
 * - A program, its plan, calendar and workouts belong to one person.
 * - A coach linked to that person may read and change their programs and read
 *   their workouts and charts. Photos need the person's own say-so on top.
 * - A record someone can't see answers exactly like one that doesn't exist.
 */

/** The database a check runs on: the shared handle or an open transaction. */
export type FitnessDb =
  | CustomShellDb
  | Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

export type FitnessProgram = typeof fitnessPrograms.$inferSelect

/** True when `actorId` is the person or a coach linked to them. */
export async function canReachPerson(
  actorId: string,
  personId: string,
  database: FitnessDb = db
): Promise<boolean> {
  if (actorId === personId) return true
  const [link] = await database
    .select({ coach: fitnessCoachClients.coachUserId })
    .from(fitnessCoachClients)
    .where(
      and(
        eq(fitnessCoachClients.coachUserId, actorId),
        eq(fitnessCoachClients.clientUserId, personId),
        isNotNull(fitnessCoachClients.acceptedAt)
      )
    )
    .limit(1)
  return Boolean(link)
}

/** A program the actor may see, or the refusal a missing one gets. */
export async function programFor(
  actorId: string,
  programId: string,
  database: FitnessDb = db,
  { forChange = false }: { forChange?: boolean } = {}
): Promise<FitnessProgram> {
  const [program] = await database
    .select()
    .from(fitnessPrograms)
    .where(eq(fitnessPrograms.id, programId))
    .limit(1)
  if (!program || !(await canReachPerson(actorId, program.userId, database))) {
    throw new Error(FITNESS_ERRORS.programNotFound)
  }
  if (forChange && program.archivedAt) throw new Error(FITNESS_ERRORS.programArchived)
  return program
}
