import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import type { AskAi } from "@/server/travel/ai"
import { createDraftActivities, draftTripPlan, type FindPlace } from "@/server/travel/trip-draft"
import { createActivity, createTrip, loadTripPage } from "@/server/travel/trips"
import { deleteType, listTypes } from "@/server/travel/types"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database, { name: "Anna" })
  ben = await insertUser(database, { name: "Ben" })
})

afterEach(async () => {
  await client.close()
})

/** An AI that answers with this plan, and remembers what it was asked. */
function aiAnswering(answer: unknown) {
  const asked: string[] = []
  const ask: AskAi = async (_system, prompt) => {
    asked.push(prompt)
    return `Here you go:\n${typeof answer === "string" ? answer : JSON.stringify(answer)}`
  }
  return { ask, asked }
}

const day = (number: number, count: number) => ({
  day: number,
  activities: Array.from({ length: count }, (_, index) => ({
    title: `Day ${number} stop ${index + 1}`,
    kind: index === 1 ? "food" : "sight",
    startTime: `${String(9 + index * 2).padStart(2, "0")}:00`,
    minutes: 90,
  })),
})

async function kyoto(days = 3) {
  return (await createTrip(anna.id, { name: "Kyoto", days, currency: "JPY", startDate: "2026-11-02", destination: "Kyoto" }, database)).id
}

describe("draft a trip with AI (Travel features part 7)", () => {
  it("plans each empty day with timed sights and food, and saves nothing yet", async () => {
    const tripId = await kyoto()
    const { ask, asked } = aiAnswering({ days: [day(1, 4), day(2, 3), day(3, 5)] })
    const draft = await draftTripPlan(anna.id, { tripId }, { database, ask })
    expect(draft.days).toEqual([1, 2, 3])
    expect(draft.items).toHaveLength(12)
    const types = await listTypes(anna.id, database)
    const food = types.find((type) => type.builtin === "food")!
    expect(draft.items[1]).toEqual({ day: 1, title: "Day 1 stop 2", typeId: food.id, startTime: "11:00", durationMinutes: 90 })
    // The AI is told where and when, and which days to plan.
    expect(asked[0]).toContain("Kyoto")
    expect(asked[0]).toContain("Day 1 is Mon 2 Nov.")
    expect((await loadTripPage(anna.id, tripId, database)).activities).toEqual([])
  })

  it("leaves days that already have something on them alone", async () => {
    const tripId = await kyoto()
    await createActivity(anna.id, { tripId, day: 2, title: "Tea ceremony" }, database)
    const { ask, asked } = aiAnswering({ days: [day(1, 3), day(2, 3), day(3, 3)] })
    const draft = await draftTripPlan(anna.id, { tripId }, { database, ask })
    expect(draft.days).toEqual([1, 3])
    expect(draft.skipped).toEqual([2])
    // Day 2 came back from the AI anyway, and is dropped.
    expect(new Set(draft.items.map((item) => item.day))).toEqual(new Set([1, 3]))
    expect(asked[0]).not.toContain("Day 2 is")
  })

  it("keeps at most 5 a day, drops a card with no name, and empties a wrong field rather than failing", async () => {
    const tripId = await kyoto(1)
    const { ask } = aiAnswering({
      days: [
        {
          day: 1,
          activities: [
            { title: "", kind: "sight" },
            { title: "Kinkaku-ji", kind: "castle", startTime: "9am", minutes: "lots" },
            ...day(1, 6).activities,
          ],
        },
      ],
    })
    const draft = await draftTripPlan(anna.id, { tripId }, { database, ask })
    expect(draft.items).toHaveLength(5)
    const other = (await listTypes(anna.id, database)).find((type) => type.builtin === "other")!
    expect(draft.items[0]).toEqual({ day: 1, title: "Kinkaku-ji", typeId: other.id, startTime: null, durationMinutes: null })
  })

  it("drafts at most 14 days, and says how many are left for next time", async () => {
    const tripId = await kyoto(20)
    const { ask } = aiAnswering({ days: Array.from({ length: 20 }, (_, index) => day(index + 1, 3)) })
    const draft = await draftTripPlan(anna.id, { tripId }, { database, ask })
    expect(draft.days).toHaveLength(14)
    expect(draft.later).toBe(6)
    expect(Math.max(...draft.items.map((item) => item.day))).toBe(14)
  })

  it("refuses a trip with no destination, with every day planned, or someone else's, and a muddled answer", async () => {
    const { ask } = aiAnswering({ days: [day(1, 3)] })
    const nowhere = (await createTrip(anna.id, { name: "Somewhere", days: 1, currency: "USD", startDate: null, destination: null }, database)).id
    await expect(draftTripPlan(anna.id, { tripId: nowhere }, { database, ask })).rejects.toThrow(TRAVEL_ERRORS.draftNeedsDestination)
    const full = await kyoto(1)
    await createActivity(anna.id, { tripId: full, day: 1, title: "Busy" }, database)
    await expect(draftTripPlan(anna.id, { tripId: full }, { database, ask })).rejects.toThrow(TRAVEL_ERRORS.draftNoEmptyDays)
    const tripId = await kyoto(1)
    await expect(draftTripPlan(ben.id, { tripId }, { database, ask })).rejects.toThrow(TRAVEL_ERRORS.tripNotFound)
    await expect(draftTripPlan(anna.id, { tripId }, { database, ask: aiAnswering("no plan today").ask })).rejects.toThrow(
      TRAVEL_ERRORS.draftFailed
    )
    await expect(draftTripPlan(anna.id, { tripId }, { database, ask: aiAnswering({ days: [] }).ask })).rejects.toThrow(
      TRAVEL_ERRORS.draftFailed
    )
  })

  it("makes the ticked activities after each day's cards, with Google's place when it finds one", async () => {
    const tripId = await kyoto(2)
    await createActivity(anna.id, { tripId, day: 1, title: "Arrive" }, database)
    const findPlace: FindPlace = async (name, destination) =>
      name === "Nishiki Market"
        ? {
            place: { name, address: `Nakagyo Ward, ${destination}`, lat: 35.005, lng: 135.764, placeId: "ChIJnishiki" },
            openingHours: null,
            website: "https://www.kyoto-nishiki.or.jp/",
            phone: null,
          }
        : null
    const made = await createDraftActivities(
      anna.id,
      {
        tripId,
        items: [
          { day: 1, title: "Nishiki Market", typeId: null, startTime: "12:00", durationMinutes: 60 },
          { day: 2, title: "Somewhere made up", typeId: null, startTime: null, durationMinutes: null },
        ],
      },
      { database, findPlace }
    )
    expect(made).toMatchObject({ placed: 1, looked: true })
    const page = await loadTripPage(anna.id, tripId, database)
    const market = page.activities.find((activity) => activity.title === "Nishiki Market")!
    expect(market).toMatchObject({ day: 1, position: 1, startTime: "12:00", durationMinutes: 60 })
    expect(market.place).toMatchObject({ placeId: "ChIJnishiki", address: "Nakagyo Ward, Kyoto" })
    expect(page.activities.find((activity) => activity.title === "Somewhere made up")!.place).toBeNull()
  })

  it("refuses a day past the trip's end, a removed type and someone else's trip", async () => {
    const tripId = await kyoto(2)
    const item = { day: 3, title: "Too late", typeId: null, startTime: null, durationMinutes: null }
    await expect(createDraftActivities(anna.id, { tripId, items: [item] }, { database, findPlace: null })).rejects.toThrow(
      TRAVEL_ERRORS.dayOutOfRange
    )
    const sight = (await listTypes(anna.id, database)).find((type) => type.builtin === "sight")!
    await deleteType(anna.id, sight.id, database)
    await expect(
      createDraftActivities(anna.id, { tripId, items: [{ ...item, day: 1, typeId: sight.id }] }, { database, findPlace: null })
    ).rejects.toThrow(TRAVEL_ERRORS.typeNotFound)
    await expect(
      createDraftActivities(ben.id, { tripId, items: [{ ...item, day: 1 }] }, { database, findPlace: null })
    ).rejects.toThrow(TRAVEL_ERRORS.tripNotFound)
  })
})
