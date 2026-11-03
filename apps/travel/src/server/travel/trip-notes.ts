import { and, count, eq } from "drizzle-orm"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { storedNotes } from "@/lib/travel/notes"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireTrip } from "@/server/travel/access"
import { travelTripNotes, travelTrips } from "@/server/travel/schema"

const MAX_NOTES = 200

/**
 * A trip's notes (task "Misc"; Tyler, 2 Nov 2026: "Add a note icon here I
 * want to add archive of notes there. Notes use tiptap editor"). As many as
 * the person likes, each the shell editor's own document, newest change first.
 */
export async function createTripNote(userId: string, tripId: string, database: CustomShellDb = db) {
  const trip = await requireTrip(userId, tripId, database)
  const [held] = await database.select({ value: count() }).from(travelTripNotes).where(eq(travelTripNotes.tripId, trip.id))
  if ((held?.value ?? 0) >= MAX_NOTES) throw new Error(TRAVEL_ERRORS.tooManyNotes)
  const at = now()
  const id = uuid()
  await database.insert(travelTripNotes).values({ id, tripId: trip.id, body: "", createdAt: at, updatedAt: at })
  return { id }
}

/** The note, when it's on one of the person's own trips. */
async function requireNote(userId: string, noteId: string, database: Pick<CustomShellDb, "select">) {
  const [row] = await database
    .select({ id: travelTripNotes.id })
    .from(travelTripNotes)
    .innerJoin(travelTrips, eq(travelTrips.id, travelTripNotes.tripId))
    .where(and(eq(travelTripNotes.id, noteId), eq(travelTrips.ownerUserId, userId)))
    .limit(1)
  if (!row) throw new Error(TRAVEL_ERRORS.noteNotFound)
  return row
}

export async function saveTripNote(userId: string, input: { noteId: string; body: string }, database: CustomShellDb = db) {
  await requireNote(userId, input.noteId, database)
  await database
    .update(travelTripNotes)
    .set({ body: storedNotes(input.body), updatedAt: now() })
    .where(eq(travelTripNotes.id, input.noteId))
}

export async function deleteTripNote(userId: string, noteId: string, database: CustomShellDb = db) {
  await requireNote(userId, noteId, database)
  await database.delete(travelTripNotes).where(eq(travelTripNotes.id, noteId))
}

/** A copy of a note on the same trip, made now, so it's first in the list. */
export async function duplicateTripNote(userId: string, noteId: string, database: CustomShellDb = db) {
  await requireNote(userId, noteId, database)
  const [note] = await database.select().from(travelTripNotes).where(eq(travelTripNotes.id, noteId)).limit(1)
  const [held] = await database.select({ value: count() }).from(travelTripNotes).where(eq(travelTripNotes.tripId, note.tripId))
  if ((held?.value ?? 0) >= MAX_NOTES) throw new Error(TRAVEL_ERRORS.tooManyNotes)
  const at = now()
  const id = uuid()
  await database.insert(travelTripNotes).values({ id, tripId: note.tripId, body: note.body, createdAt: at, updatedAt: at })
  return { id }
}
