import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { travelTripNotes } from "@/server/travel/schema"
import {
  createTripNote,
  deleteTripNote,
  duplicateTripNote,
  listNoteBin,
  pinTripNote,
  purgeTripNote,
  restoreTripNote,
  saveTripNote,
} from "@/server/travel/trip-notes"
import { createTrip, loadTripPage } from "@/server/travel/trips"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let tripId: string

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
  ben = await insertUser(database)
  ;({ id: tripId } = await createTrip(anna.id, { name: "Tokyo", days: 3, currency: "JPY", startDate: null }, database))
})

afterEach(async () => {
  await client.close()
})

async function note(text: string, changedAt: string) {
  const { id } = await createTripNote(anna.id, tripId, database)
  await saveTripNote(anna.id, { noteId: id, body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }) }, database)
  await database.update(travelTripNotes).set({ updatedAt: new Date(changedAt) }).where(eq(travelTripNotes.id, id))
  return id
}

const listed = async () => (await loadTripPage(anna.id, tripId, database)).notes.map((each) => ({ id: each.id, pinned: each.pinned }))

describe("notes in the bin (Travel features 4, part 6)", () => {
  it("moves a deleted note to the bin, counts it there, and puts it back", async () => {
    const id = await note("Ramen list", "2099-01-01T00:00:00Z")
    await deleteTripNote(anna.id, id, database)
    const page = await loadTripPage(anna.id, tripId, database)
    expect(page.notes).toEqual([])
    expect(page.binCount).toBe(1)
    expect((await listNoteBin(anna.id, tripId, database)).map((each) => each.id)).toEqual([id])
    // A binned note can't be written in until it's back.
    await expect(saveTripNote(anna.id, { noteId: id, body: "" }, database)).rejects.toThrow(TRAVEL_ERRORS.noteNotFound)
    await restoreTripNote(anna.id, id, database)
    expect(await listed()).toEqual([{ id, pinned: false }])
    expect((await loadTripPage(anna.id, tripId, database)).binCount).toBe(0)
  })

  it("deletes a binned note for good, and empties notes binned more than 30 days ago", async () => {
    const gone = await note("Old", "2099-01-01T00:00:00Z")
    const kept = await note("Recent", "2099-01-01T00:00:00Z")
    await deleteTripNote(anna.id, gone, database)
    await deleteTripNote(anna.id, kept, database)
    await database.update(travelTripNotes).set({ deletedAt: new Date("2099-01-01T00:00:00Z") }).where(eq(travelTripNotes.id, gone))
    await database.update(travelTripNotes).set({ deletedAt: new Date("2099-01-25T00:00:00Z") }).where(eq(travelTripNotes.id, kept))
    const bin = await listNoteBin(anna.id, tripId, database, new Date("2099-02-05T00:00:00Z"))
    expect(bin.map((each) => each.id)).toEqual([kept])
    await purgeTripNote(anna.id, kept, database)
    expect(await database.select().from(travelTripNotes)).toEqual([])
  })

  it("never lets someone else bin, put back or delete a note", async () => {
    const id = await note("Mine", "2099-01-01T00:00:00Z")
    await expect(deleteTripNote(ben.id, id, database)).rejects.toThrow(TRAVEL_ERRORS.noteNotFound)
    await deleteTripNote(anna.id, id, database)
    await expect(restoreTripNote(ben.id, id, database)).rejects.toThrow(TRAVEL_ERRORS.noteNotFound)
    await expect(purgeTripNote(ben.id, id, database)).rejects.toThrow(TRAVEL_ERRORS.noteNotFound)
    // Delete for good only works on a note already in the bin.
    await restoreTripNote(anna.id, id, database)
    await expect(purgeTripNote(anna.id, id, database)).rejects.toThrow(TRAVEL_ERRORS.noteNotFound)
  })

  it("leaves binned notes out of the 200 a trip can hold", async () => {
    const ids: string[] = []
    for (let index = 0; index < 200; index += 1) ids.push((await createTripNote(anna.id, tripId, database)).id)
    await expect(createTripNote(anna.id, tripId, database)).rejects.toThrow(TRAVEL_ERRORS.tooManyNotes)
    await deleteTripNote(anna.id, ids[0], database)
    await createTripNote(anna.id, tripId, database)
    // Full again, so the binned one can't come back until another goes.
    await expect(restoreTripNote(anna.id, ids[0], database)).rejects.toThrow(TRAVEL_ERRORS.tooManyNotes)
  })
})

describe("pinned notes (Travel features 4, part 7)", () => {
  it("lists pinned notes first, newest change first within each group", async () => {
    const oldest = await note("Oldest", "2099-01-01T00:00:00Z")
    const middle = await note("Middle", "2099-01-02T00:00:00Z")
    const newest = await note("Newest", "2099-01-03T00:00:00Z")
    expect((await listed()).map((each) => each.id)).toEqual([newest, middle, oldest])
    await pinTripNote(anna.id, { noteId: oldest, pinned: true }, database)
    await pinTripNote(anna.id, { noteId: middle, pinned: true }, database)
    expect(await listed()).toEqual([
      { id: middle, pinned: true },
      { id: oldest, pinned: true },
      { id: newest, pinned: false },
    ])
    await pinTripNote(anna.id, { noteId: middle, pinned: false }, database)
    expect((await listed()).map((each) => each.id)).toEqual([oldest, newest, middle])
  })

  it("makes an unpinned copy, and keeps the pin on a note put back from the bin", async () => {
    const id = await note("Pinned", "2099-01-01T00:00:00Z")
    await pinTripNote(anna.id, { noteId: id, pinned: true }, database)
    const { id: copy } = await duplicateTripNote(anna.id, id, database)
    expect((await listed()).find((each) => each.id === copy)?.pinned).toBe(false)
    await deleteTripNote(anna.id, id, database)
    await restoreTripNote(anna.id, id, database)
    expect((await listed()).find((each) => each.id === id)?.pinned).toBe(true)
  })

  it("never lets someone else pin a note", async () => {
    const id = await note("Mine", "2099-01-01T00:00:00Z")
    await expect(pinTripNote(ben.id, { noteId: id, pinned: true }, database)).rejects.toThrow(TRAVEL_ERRORS.noteNotFound)
  })
})
