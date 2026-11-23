import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import type { AskAi } from "@/server/travel/ai"
import { createDraftActivities, suggestTripIdeas } from "@/server/travel/trip-draft"
import { createActivity, createTrip, loadTripPage } from "@/server/travel/trips"

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

function aiAnswering(answer: unknown) {
  const asked: string[] = []
  const ask: AskAi = async (_system, prompt) => {
    asked.push(prompt)
    return typeof answer === "string" ? answer : `Sure:\n${JSON.stringify(answer)}`
  }
  return { ask, asked }
}

const idea = (title: string, kind = "sight") => ({ title, kind, reason: `Because of ${title}.` })

async function kyoto(destination = "Kyoto") {
  return (await createTrip(anna.id, { name: "Kyoto", days: 3, currency: "JPY", startDate: null, destination }, database)).id
}

describe("Suggest Ideas (Travel features 3, part 9)", () => {
  it("brings back up to 10 places, leaving out ones already on the trip or named twice", async () => {
    const tripId = await kyoto()
    await createActivity(anna.id, { tripId, day: 1, title: "Nishiki Market" }, database)
    const names = ["Nishiki Market", "Kinkaku-ji", "kinkaku-ji", ...Array.from({ length: 12 }, (_, index) => `Place ${index + 1}`)]
    const { ask, asked } = aiAnswering({ ideas: names.map((name, index) => idea(name, index === 3 ? "food" : "sight")) })
    const { items } = await suggestTripIdeas(anna.id, { tripId }, { database, ask })
    expect(items.map((item) => item.title)).toEqual(["Kinkaku-ji", ...Array.from({ length: 9 }, (_, index) => `Place ${index + 1}`)])
    expect(items[0].reason).toBe("Because of Kinkaku-ji.")
    expect(asked[0]).toContain("Nishiki Market")
  })

  it("puts the ticked places into Ideas only, after the ideas already there", async () => {
    const tripId = await kyoto()
    await createActivity(anna.id, { tripId, day: null, title: "Old idea" }, database)
    await createDraftActivities(
      anna.id,
      {
        tripId,
        items: [
          { day: null, title: "Kinkaku-ji", typeId: null, startTime: null, durationMinutes: null },
          { day: null, title: "Ryoan-ji", typeId: null, startTime: null, durationMinutes: null },
        ],
      },
      { database, findPlace: null, fetchPhoto: null }
    )
    const ideas = (await loadTripPage(anna.id, tripId, database)).activities
      .filter((activity) => activity.day === null)
      .sort((a, b) => a.position - b.position)
    expect(ideas.map((activity) => activity.title)).toEqual(["Old idea", "Kinkaku-ji", "Ryoan-ji"])
  })

  it("says what's wrong: no destination, a muddled answer, nothing new, or someone else's trip", async () => {
    const bare = await kyoto("")
    await expect(suggestTripIdeas(anna.id, { tripId: bare }, { database, ask: aiAnswering({ ideas: [idea("A")] }).ask })).rejects.toThrow(
      TRAVEL_ERRORS.draftNeedsDestination
    )
    const tripId = await kyoto()
    await expect(suggestTripIdeas(anna.id, { tripId }, { database, ask: aiAnswering("no idea").ask })).rejects.toThrow(
      TRAVEL_ERRORS.ideasFailed
    )
    await createActivity(anna.id, { tripId, day: 2, title: "Kinkaku-ji" }, database)
    await expect(
      suggestTripIdeas(anna.id, { tripId }, { database, ask: aiAnswering({ ideas: [idea("Kinkaku-ji")] }).ask })
    ).rejects.toThrow(TRAVEL_ERRORS.ideasNoneNew)
    await expect(suggestTripIdeas(ben.id, { tripId }, { database, ask: aiAnswering({ ideas: [idea("A")] }).ask })).rejects.toThrow(
      TRAVEL_ERRORS.tripNotFound
    )
  })
})
