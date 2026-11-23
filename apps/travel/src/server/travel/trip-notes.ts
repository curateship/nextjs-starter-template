import { and, count, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { storedNotes } from "@/lib/travel/notes"
import { TRIP_BIN_DAYS } from "@/lib/travel/trip-bin"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireTrip } from "@/server/travel/access"
import { travelTripNotes, travelTrips } from "@/server/travel/schema"

const MAX_NOTES = 200

/**
 * A trip's notes (task "Misc"; Tyler, 2 Nov 2026: "Add a note icon here I
 * want to add archive of notes there. Notes use tiptap editor"). As many as
 * the person likes, each the shell editor's own document.
 *
 * - **Pinned first** (Travel features 4, part 7; Tyler, 6 Nov 2026:
 *   "Right-click, many pins"): pinned notes lead the list, then the rest, each
 *   group newest change first.
 * - **Deleting bins a note** (part 6; "Same Bin as cards"): it waits 30 days
 *   in the trip's bin with its cards, then goes for good the next time the bin
 *   is opened. A binned note isn't on the list, in the Photos tab or counted
 *   toward the 200.
 */
export const NOTE_ORDER = [sql`${travelTripNotes.pinnedAt} is null`, desc(travelTripNotes.updatedAt)] as const

async function countLive(tripId: string, database: Pick<CustomShellDb, "select">) {
  const [held] = await database
    .select({ value: count() })
    .from(travelTripNotes)
    .where(and(eq(travelTripNotes.tripId, tripId), isNull(travelTripNotes.deletedAt)))
  return held?.value ?? 0
}

export async function createTripNote(userId: string, tripId: string, database: CustomShellDb = db) {
  const trip = await requireTrip(userId, tripId, database)
  if ((await countLive(trip.id, database)) >= MAX_NOTES) throw new Error(TRAVEL_ERRORS.tooManyNotes)
  const at = now()
  const id = uuid()
  await database.insert(travelTripNotes).values({ id, tripId: trip.id, body: "", createdAt: at, updatedAt: at })
  return { id }
}

/** The note, when it's on one of the person's own trips: out of the bin, or in it with `inBin`. */
async function requireNote(
  userId: string,
  noteId: string,
  database: Pick<CustomShellDb, "select">,
  { inBin = false }: { inBin?: boolean } = {}
) {
  const [row] = await database
    .select({ note: travelTripNotes })
    .from(travelTripNotes)
    .innerJoin(travelTrips, eq(travelTrips.id, travelTripNotes.tripId))
    .where(
      and(
        eq(travelTripNotes.id, noteId),
        eq(travelTrips.ownerUserId, userId),
        isNull(travelTrips.deletedAt),
        inBin ? isNotNull(travelTripNotes.deletedAt) : isNull(travelTripNotes.deletedAt)
      )
    )
    .limit(1)
  if (!row) throw new Error(TRAVEL_ERRORS.noteNotFound)
  return row.note
}

export async function saveTripNote(userId: string, input: { noteId: string; body: string }, database: CustomShellDb = db) {
  await requireNote(userId, input.noteId, database)
  await database
    .update(travelTripNotes)
    .set({ body: storedNotes(input.body), updatedAt: now() })
    .where(eq(travelTripNotes.id, input.noteId))
}

/** Into the trip's bin, with Undo; it can be put back for 30 days. */
export async function deleteTripNote(userId: string, noteId: string, database: CustomShellDb = db) {
  await requireNote(userId, noteId, database)
  await database.update(travelTripNotes).set({ deletedAt: now() }).where(eq(travelTripNotes.id, noteId))
}

/** Back from the bin to the notes list as it was, pin and all. */
export async function restoreTripNote(userId: string, noteId: string, database: CustomShellDb = db) {
  const note = await requireNote(userId, noteId, database, { inBin: true })
  if ((await countLive(note.tripId, database)) >= MAX_NOTES) throw new Error(TRAVEL_ERRORS.tooManyNotes)
  await database.update(travelTripNotes).set({ deletedAt: null }).where(eq(travelTripNotes.id, noteId))
}

/** Delete for good, from the bin. */
export async function purgeTripNote(userId: string, noteId: string, database: CustomShellDb = db) {
  await requireNote(userId, noteId, database, { inBin: true })
  await database.delete(travelTripNotes).where(eq(travelTripNotes.id, noteId))
}

export type BinNote = { id: string; body: string; deletedAt: string }

/** The trip's binned notes, newest first. Any binned more than 30 days ago go for good on the way. */
export async function listNoteBin(userId: string, tripId: string, database: CustomShellDb = db, at: Date = new Date()) {
  const trip = await requireTrip(userId, tripId, database)
  const cutoff = new Date(at.getTime() - TRIP_BIN_DAYS * 24 * 60 * 60 * 1000)
  await database
    .delete(travelTripNotes)
    .where(and(eq(travelTripNotes.tripId, trip.id), isNotNull(travelTripNotes.deletedAt), lt(travelTripNotes.deletedAt, cutoff)))
  const rows = await database
    .select({ id: travelTripNotes.id, body: travelTripNotes.body, deletedAt: travelTripNotes.deletedAt })
    .from(travelTripNotes)
    .where(and(eq(travelTripNotes.tripId, trip.id), isNotNull(travelTripNotes.deletedAt)))
    .orderBy(desc(travelTripNotes.deletedAt))
  return rows.map((row): BinNote => ({ id: row.id, body: row.body, deletedAt: row.deletedAt!.toISOString() }))
}

/** Pins a note to the top of the list, or takes the pin off. The note's last change stays as it was. */
export async function pinTripNote(userId: string, input: { noteId: string; pinned: boolean }, database: CustomShellDb = db) {
  await requireNote(userId, input.noteId, database)
  await database
    .update(travelTripNotes)
    .set({ pinnedAt: input.pinned ? now() : null })
    .where(eq(travelTripNotes.id, input.noteId))
}

/** A copy of a note on the same trip, made now and not pinned, so it leads the unpinned notes. */
export async function duplicateTripNote(userId: string, noteId: string, database: CustomShellDb = db) {
  const note = await requireNote(userId, noteId, database)
  if ((await countLive(note.tripId, database)) >= MAX_NOTES) throw new Error(TRAVEL_ERRORS.tooManyNotes)
  const at = now()
  const id = uuid()
  await database.insert(travelTripNotes).values({ id, tripId: note.tripId, body: note.body, createdAt: at, updatedAt: at })
  return { id }
}
