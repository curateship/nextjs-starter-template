import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import type { AskAi } from "@/server/travel/ai"
import { fitIntoWindows, freeWindows } from "@/lib/travel/fill-day"
import { createDraftActivities, draftTripPlan, fillTripDay, type FindPlace } from "@/server/travel/trip-draft"
import { createActivity, createTrip, loadTripPage, updateActivity } from "@/server/travel/trips"
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

  it("makes the ticked activities after each day's cards, with Google's place and photo when it finds one", async () => {
    const tripId = await kyoto(2)
    await createActivity(anna.id, { tripId, day: 1, title: "Arrive" }, database)
    const findPlace: FindPlace = async (name, destination) =>
      name === "Nishiki Market"
        ? {
            place: { name, address: `Nakagyo Ward, ${destination}`, lat: 35.005, lng: 135.764, placeId: "ChIJnishiki" },
            openingHours: null,
            website: "https://www.kyoto-nishiki.or.jp/",
            phone: null,
            photoName: "places/ChIJnishiki/photos/front",
          }
        : null
    const fetched: string[] = []
    const fetchPhoto = async (photoName: string) => {
      fetched.push(photoName)
      return "https://media.example.com/nishiki.jpg"
    }
    const made = await createDraftActivities(
      anna.id,
      {
        tripId,
        items: [
          { day: 1, title: "Nishiki Market", typeId: null, startTime: "12:00", durationMinutes: 60 },
          { day: 2, title: "Somewhere made up", typeId: null, startTime: null, durationMinutes: null },
        ],
      },
      { database, findPlace, fetchPhoto }
    )
    expect(made).toMatchObject({ placed: 1, looked: true })
    // More Travel features part 2: a found place brings its Google photo as the picture.
    expect(fetched).toEqual(["places/ChIJnishiki/photos/front"])
    const page = await loadTripPage(anna.id, tripId, database)
    const market = page.activities.find((activity) => activity.title === "Nishiki Market")!
    expect(market).toMatchObject({ day: 1, position: 1, startTime: "12:00", durationMinutes: 60 })
    expect(market.place).toMatchObject({ placeId: "ChIJnishiki", address: "Nakagyo Ward, Kyoto" })
    expect(market.photoUrl).toBe("https://media.example.com/nishiki.jpg")
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

describe("fill this day (More Travel features part 6)", () => {
  it("finds the gaps of 45 minutes or more between 8 AM and 10 PM", () => {
    expect(freeWindows([])).toEqual([{ start: 480, end: 1320 }])
    // 9:00 for 2 hours, 13:00 with no length (taken as an hour), 20:00 for 30 minutes.
    expect(
      freeWindows([
        { startTime: "09:00", durationMinutes: 120 },
        { startTime: "13:00", durationMinutes: null },
        { startTime: "20:00", durationMinutes: 30 },
        { startTime: null, durationMinutes: 60 },
      ])
    ).toEqual([
      { start: 480, end: 540 },
      { start: 660, end: 780 },
      { start: 840, end: 1200 },
      { start: 1230, end: 1320 },
    ])
    // 8:20 to 9:00 is 40 minutes, too short, and the rest of the day is taken.
    expect(freeWindows([{ startTime: "07:00", durationMinutes: 80 }, { startTime: "09:00", durationMinutes: 800 }])).toEqual([])
  })

  it("keeps ideas inside a gap, cuts one running past it, and never lets two overlap", () => {
    const windows = [{ start: 660, end: 780 }]
    const idea = (startTime: string | null, durationMinutes: number | null) => ({ title: startTime ?? "none", startTime, durationMinutes })
    expect(
      fitIntoWindows([idea("12:30", 60), idea("11:00", 60), idea("11:30", 30), idea("09:00", 60), idea(null, 60)], windows)
    ).toEqual([idea("11:00", 60), { ...idea("12:30", 30) }])
    // 12:50 would leave 10 minutes: dropped. A short idea that fits whole is kept.
    expect(fitIntoWindows([idea("12:50", 60)], windows)).toEqual([])
    expect(fitIntoWindows([idea("12:40", 20)], windows)).toEqual([idea("12:40", 20)])
  })

  it("tells the AI what the day holds, its free time and its must do, and keeps only what fits", async () => {
    const tripId = await kyoto()
    const temple = await createActivity(anna.id, { tripId, day: 2, title: "Kiyomizu-dera", startTime: "09:00" }, database)
    await updateActivity(anna.id, { activityId: temple.id, durationMinutes: 120, mustDo: true }, database)
    const { ask, asked } = aiAnswering({
      days: [
        {
          day: 2,
          activities: [
            { title: "Lunch at Okutan", kind: "food", startTime: "12:00", minutes: 60 },
            { title: "Clashes with the temple", kind: "sight", startTime: "10:00", minutes: 60 },
            { title: "Gion walk", kind: "sight", startTime: "21:30", minutes: 90 },
          ],
        },
        { day: 1, activities: [{ title: "Not asked for", kind: "sight", startTime: "12:00", minutes: 60 }] },
      ],
    })
    const draft = await fillTripDay(anna.id, { tripId, day: 2 }, { database, ask })
    expect(asked[0]).toContain("Kiyomizu-dera at 9:00 AM for 120 minutes (a must do: keep it)")
    expect(asked[0]).toContain("08:00 to 09:00, 11:00 to 22:00")
    expect(draft.days).toEqual([2])
    expect(draft.items.map((item) => [item.title, item.startTime, item.durationMinutes])).toEqual([
      ["Lunch at Okutan", "12:00", 60],
      ["Gion walk", "21:30", 30],
    ])
  })

  it("asks nothing for a day with no free time, and names what is already on the trip when drafting", async () => {
    const tripId = await kyoto(2)
    await createActivity(anna.id, { tripId, day: 1, title: "All day tour", startTime: "08:00" }, database)
    const tour = (await loadTripPage(anna.id, tripId, database)).activities[0]
    await updateActivity(anna.id, { activityId: tour.id, durationMinutes: 14 * 60 }, database)
    const { ask, asked } = aiAnswering({ days: [day(2, 3)] })
    await expect(fillTripDay(anna.id, { tripId, day: 1 }, { database, ask })).rejects.toThrow(TRAVEL_ERRORS.fillNoFreeTime)
    expect(asked).toEqual([])
    const idea = await createActivity(anna.id, { tripId, day: null, title: "Ghibli Museum" }, database)
    await updateActivity(anna.id, { activityId: idea.id, mustDo: true }, database)
    await draftTripPlan(anna.id, { tripId }, { database, ask })
    expect(asked[0]).toContain("never plan these again: Ghibli Museum; All day tour.")
  })

  it("takes a single day the AI numbered wrongly as the day asked for", async () => {
    const tripId = await kyoto()
    const { ask } = aiAnswering({ days: [{ day: 1, activities: [{ title: "Gion walk", kind: "sight", startTime: "10:00", minutes: 60 }] }] })
    const draft = await fillTripDay(anna.id, { tripId, day: 3 }, { database, ask })
    expect(draft.items).toEqual([expect.objectContaining({ day: 3, title: "Gion walk" })])
  })

  it("leaves out a planned place already on the trip, or twice in the plan, before fetching its photo", async () => {
    const tripId = await kyoto(2)
    const first = await createActivity(anna.id, { tripId, day: 1, title: "Market" }, database)
    const nishiki = { name: "Nishiki Market", address: "Kyoto", lat: 35, lng: 135.7, placeId: "ChIJnishiki" }
    await updateActivity(anna.id, { activityId: first.id, place: nishiki }, database)
    const findPlace: FindPlace = async (name) =>
      name.includes("Nishiki")
        ? { place: nishiki, openingHours: null, website: null, phone: null, photoName: "places/ChIJnishiki/photos/a" }
        : null
    const fetched: string[] = []
    const made = await createDraftActivities(
      anna.id,
      {
        tripId,
        items: [
          { day: 2, title: "Nishiki food walk", typeId: null, startTime: "12:00", durationMinutes: 60 },
          { day: 2, title: "Tea house", typeId: null, startTime: "15:00", durationMinutes: 60 },
          { day: 2, title: "tea house", typeId: null, startTime: "17:00", durationMinutes: 60 },
        ],
      },
      { database, findPlace, fetchPhoto: async (name) => (fetched.push(name), null) }
    )
    expect(made).toMatchObject({ repeated: 2, placed: 0 })
    expect(made.created).toHaveLength(1)
    expect(fetched).toEqual([])
  })
})
