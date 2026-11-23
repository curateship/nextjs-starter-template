import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { readNotes } from "@/lib/travel/notes"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import type { AskAi } from "@/server/travel/ai"
import { addPlaceTips, notesWithTips, readTips } from "@/server/travel/place-tips"
import { createActivity, createTrip, loadTripPage, updateActivity } from "@/server/travel/trips"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
  ben = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

const TIPS = ["Go before 8am to beat the coach tours.", "Walk to the top for the quiet shrines.", "Allow two hours."]

function answering(answer: unknown) {
  const asked: string[] = []
  const ask: AskAi = async (_system, prompt) => {
    asked.push(prompt)
    return typeof answer === "string" ? answer : `Sure:\n${JSON.stringify(answer)}`
  }
  return { ask, asked }
}

const note = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

describe("tips for a place, by AI (More Travel features part 5)", () => {
  it("keeps 3 to 5 tips and refuses an answer with fewer", () => {
    expect(readTips(JSON.stringify({ tips: [...TIPS, "", 4, "Five.", "Six."] }))).toEqual([...TIPS, "Five.", "Six."].slice(0, 5))
    expect(() => readTips(JSON.stringify({ tips: ["Only one."] }))).toThrow(TRAVEL_ERRORS.tipsFailed)
    expect(() => readTips("no json here")).toThrow(TRAVEL_ERRORS.tipsFailed)
  })

  it("adds a Tips heading and list after what the notes hold, and never rewrites them", () => {
    const once = readNotes(notesWithTips(note("Booked the 9am slot."), TIPS))
    expect(once.content?.[0]).toMatchObject({ type: "paragraph" })
    expect(once.content?.[1]).toMatchObject({ type: "heading", attrs: { level: 3 } })
    expect(once.content?.[2]?.content).toHaveLength(3)
    const twice = readNotes(notesWithTips(JSON.stringify(once), TIPS))
    expect(twice.content).toHaveLength(5)
    expect(readNotes(notesWithTips("", TIPS)).content).toHaveLength(2)
  })

  it("asks about the card's place and saves the tips into its notes", async () => {
    const { id: tripId } = await createTrip(
      anna.id,
      { name: "Kyoto", days: 2, currency: "JPY", startDate: null, destination: "Kyoto" },
      database
    )
    const { id } = await createActivity(anna.id, { tripId, day: 1, title: "Fushimi Inari" }, database)
    await updateActivity(anna.id, { activityId: id, notes: note("Bring water.") }, database)
    const { ask, asked } = answering({ tips: TIPS })
    expect(await addPlaceTips(anna.id, { activityId: id }, { database, ask })).toEqual({ tips: 3 })
    expect(asked[0]).toContain("Fushimi Inari")
    expect(asked[0]).toContain("Kyoto")
    const notes = readNotes((await loadTripPage(anna.id, tripId, database)).activities[0].notes)
    expect(JSON.stringify(notes)).toContain("Bring water.")
    expect(JSON.stringify(notes)).toContain("Allow two hours.")
    await expect(addPlaceTips(ben.id, { activityId: id }, { database, ask })).rejects.toThrow(TRAVEL_ERRORS.activityNotFound)
  })

  it("adds nothing when the tips would push the notes past what a save allows", async () => {
    const { id: tripId } = await createTrip(anna.id, { name: "Kyoto", days: 1, currency: "JPY", startDate: null }, database)
    const { id } = await createActivity(anna.id, { tripId, day: 1, title: "Long notes" }, database)
    await updateActivity(anna.id, { activityId: id, notes: note("x".repeat(19_900)) }, database)
    const long = (await loadTripPage(anna.id, tripId, database)).activities[0].notes
    const many = JSON.stringify({ type: "doc", content: Array.from({ length: 5 }, () => JSON.parse(long).content[0]) })
    await updateActivity(anna.id, { activityId: id, notes: many }, database)
    const { ask } = answering({ tips: ["A tip that is long enough to tip it over. ".repeat(5), "Two.", "Three."] })
    await expect(addPlaceTips(anna.id, { activityId: id }, { database, ask })).rejects.toThrow(TRAVEL_ERRORS.tipsNotesFull)
  })
})
