import { and, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm"

import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { canReachPerson, type FitnessDb } from "@/server/fitness/access"
import { sendFitnessNotice } from "@/server/fitness/notices"
import { fitnessCoachNotes, fitnessWorkoutSets, fitnessWorkouts } from "@/server/fitness/schema"
import { customShellUsers } from "@/server/schema"

/**
 * A coach's notes on a client's finished workout (Tyler, 21 Oct 2026: "The
 * workout and each lift"). One note on the whole workout and one on any lift
 * in it, per coach. They go one way: the client reads them and can't write
 * one, because chat was left out on purpose.
 */

export type CoachNote = {
  id: string
  /** Null for the note on the whole workout; the lift's place in the workout otherwise. */
  position: number | null
  coachName: string
  text: string
  /** True when the person asking wrote it, so only they edit or delete it. */
  mine: boolean
  updatedAt: string
}

/** A note left on a lift in an earlier workout, shown when that lift comes up again. */
export type LiftNote = { coachName: string; text: string; day: string }

async function workoutRow(workoutId: string, database: FitnessDb) {
  const [workout] = await database.select().from(fitnessWorkouts).where(eq(fitnessWorkouts.id, workoutId)).limit(1)
  return workout ?? null
}

/**
 * The notes on one workout. The person reads every coach's; a coach reads
 * only their own, so a new coach never reads what an earlier one wrote.
 */
export async function loadCoachNotes(actorId: string, workoutId: string, database: FitnessDb = db): Promise<CoachNote[]> {
  const workout = await workoutRow(workoutId, database)
  if (!workout || !(await canReachPerson(actorId, workout.userId, database))) throw new Error(FITNESS_ERRORS.workoutNotFound)
  const rows = await database
    .select({
      id: fitnessCoachNotes.id,
      position: fitnessCoachNotes.exercisePosition,
      coachId: fitnessCoachNotes.coachUserId,
      coachName: customShellUsers.name,
      text: fitnessCoachNotes.text,
      updatedAt: fitnessCoachNotes.updatedAt,
    })
    .from(fitnessCoachNotes)
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessCoachNotes.coachUserId))
    .where(
      and(
        eq(fitnessCoachNotes.workoutId, workoutId),
        actorId === workout.userId ? undefined : eq(fitnessCoachNotes.coachUserId, actorId)
      )
    )
    .orderBy(fitnessCoachNotes.createdAt)
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    coachName: row.coachName,
    text: row.text,
    mine: row.coachId === actorId,
    updatedAt: row.updatedAt.toISOString(),
  }))
}

/**
 * For a workout being logged: the newest coach note left on each of its
 * lifts in an earlier workout, so "Coach: keep the elbows in" comes up the
 * next time the lift does.
 */
export async function liftNotesFor(
  viewerId: string,
  personId: string,
  exerciseIds: string[],
  excludeWorkoutId: string,
  database: FitnessDb = db
): Promise<Record<string, LiftNote>> {
  if (exerciseIds.length === 0) return {}
  const rows = await database
    .selectDistinct({
      exerciseId: fitnessWorkoutSets.exerciseId,
      coachName: customShellUsers.name,
      text: fitnessCoachNotes.text,
      updatedAt: fitnessCoachNotes.updatedAt,
      day: fitnessWorkouts.day,
    })
    .from(fitnessCoachNotes)
    .innerJoin(fitnessWorkouts, eq(fitnessWorkouts.id, fitnessCoachNotes.workoutId))
    .innerJoin(
      fitnessWorkoutSets,
      and(
        eq(fitnessWorkoutSets.workoutId, fitnessCoachNotes.workoutId),
        eq(fitnessWorkoutSets.exercisePosition, fitnessCoachNotes.exercisePosition)
      )
    )
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessCoachNotes.coachUserId))
    .where(
      and(
        eq(fitnessWorkouts.userId, personId),
        ne(fitnessWorkouts.id, excludeWorkoutId),
        isNotNull(fitnessCoachNotes.exercisePosition),
        inArray(fitnessWorkoutSets.exerciseId, [...new Set(exerciseIds)]),
        // A coach reading the workout sees only their own notes.
        viewerId === personId ? undefined : eq(fitnessCoachNotes.coachUserId, viewerId)
      )
    )
    .orderBy(desc(fitnessCoachNotes.updatedAt))
    .limit(200)
  const result: Record<string, LiftNote> = {}
  for (const row of rows) {
    result[row.exerciseId] ??= { coachName: row.coachName, text: row.text, day: row.day }
  }
  return result
}

/**
 * Writes or changes the coach's note on a finished workout, or on one lift in
 * it. Only a coach the person said yes to may write one; the person who
 * trained can't. A new note puts a notice in the person's bell.
 */
export async function saveCoachNote(
  actorId: string,
  input: { workoutId: string; position: number | null; text: string },
  database: FitnessDb = db
) {
  const workout = await workoutRow(input.workoutId, database)
  if (!workout || !(await canReachPerson(actorId, workout.userId, database))) throw new Error(FITNESS_ERRORS.workoutNotFound)
  if (workout.userId === actorId) throw new Error(FITNESS_ERRORS.notYourClient)
  if (!workout.finishedAt) throw new Error(FITNESS_ERRORS.noteNeedsFinish)
  const text = input.text.trim()
  if (!text) throw new Error(FITNESS_ERRORS.noteNeeded)
  if (input.position !== null) {
    const [lift] = await database
      .select({ id: fitnessWorkoutSets.id })
      .from(fitnessWorkoutSets)
      .where(and(eq(fitnessWorkoutSets.workoutId, workout.id), eq(fitnessWorkoutSets.exercisePosition, input.position)))
      .limit(1)
    if (!lift) throw new Error(FITNESS_ERRORS.setNotFound)
  }
  const place = and(
    eq(fitnessCoachNotes.workoutId, workout.id),
    eq(fitnessCoachNotes.coachUserId, actorId),
    input.position === null
      ? isNull(fitnessCoachNotes.exercisePosition)
      : eq(fitnessCoachNotes.exercisePosition, input.position)
  )
  const at = now()
  const changed = await database
    .update(fitnessCoachNotes)
    .set({ text, updatedAt: at })
    .where(place)
    .returning({ id: fitnessCoachNotes.id })
  if (changed.length > 0) return
  const inserted = await database
    .insert(fitnessCoachNotes)
    .values({
      id: uuid(),
      workoutId: workout.id,
      exercisePosition: input.position,
      coachUserId: actorId,
      text,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing()
    .returning({ id: fitnessCoachNotes.id })
  // Two saves at the same moment: the other one wrote the note first, so this one changes it.
  if (inserted.length === 0) {
    await database.update(fitnessCoachNotes).set({ text, updatedAt: at }).where(place)
    return
  }
  const [coach] = await database
    .select({ name: customShellUsers.name })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, actorId))
    .limit(1)
  await sendFitnessNotice(
    {
      recipientUserId: workout.userId,
      actorUserId: actorId,
      kind: "note",
      message: `${coach?.name ?? "Your coach"} left a note on ${workout.name}`,
      detail: text.length > 140 ? `${text.slice(0, 139)}…` : text,
      href: workout.programId ? `/programs/${workout.programId}?view=history&open=${workout.id}` : "/programs",
    },
    database
  )
}

/** Deletes one of the coach's own notes. A note someone else wrote answers like one that doesn't exist. */
export async function deleteCoachNote(actorId: string, noteId: string, database: FitnessDb = db) {
  const removed = await database
    .delete(fitnessCoachNotes)
    .where(and(eq(fitnessCoachNotes.id, noteId), eq(fitnessCoachNotes.coachUserId, actorId)))
    .returning({ id: fitnessCoachNotes.id })
  if (removed.length === 0) throw new Error(FITNESS_ERRORS.noteNotFound)
}
