import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import type { AskAi } from "@/server/travel/ai"
import { bookingAi, readBookingEmail } from "@/server/travel/booking-email"
import { createTrip } from "@/server/travel/trips"
import { listTypes } from "@/server/travel/types"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let tripId: string

const HOTEL_EMAIL = `Your booking is confirmed!
Hotel Gracery Shinjuku, 1-19-1 Kabukicho, Tokyo
Check-in: Thu 5 March from 15:00, 3 nights
Confirmation number: HG-88231
Total: ¥54,000`

/** An AI that always gives the same answer, and remembers what it was asked. */
function answering(answer: unknown): AskAi & { asked: string[] } {
  const asked: string[] = []
  const ask = (async (_system: string, prompt: string) => {
    asked.push(prompt)
    return typeof answer === "string" ? answer : JSON.stringify(answer)
  }) as AskAi & { asked: string[] }
  ask.asked = asked
  return ask
}

const HOTEL_ANSWER = {
  title: "Hotel Gracery Shinjuku",
  kind: "hotel",
  date: "2026-03-05",
  startTime: "15:00",
  nights: 3,
  placeName: "Hotel Gracery Shinjuku",
  address: "1-19-1 Kabukicho, Tokyo",
  confirmation: "HG-88231",
  costAmount: 54000,
  currency: "JPY",
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  tripId = (
    await createTrip(anna.id, { name: "Tokyo", days: 5, currency: "JPY", startDate: "2026-03-04" }, database)
  ).id
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await client.close()
})

describe("reading a booking email", () => {
  it("turns a hotel email into a Hotel on the right day", async () => {
    const ask = answering(HOTEL_ANSWER)
    const draft = await readBookingEmail(anna.id, { tripId, text: HOTEL_EMAIL }, { database, ask })
    const hotel = (await listTypes(anna.id, database)).find((type) => type.builtin === "hotel")!
    expect(draft).toEqual({
      title: "Hotel Gracery Shinjuku",
      typeId: hotel.id,
      day: 2,
      date: "2026-03-05",
      startTime: "15:00",
      nights: 3,
      placeName: "Hotel Gracery Shinjuku",
      address: "1-19-1 Kabukicho, Tokyo",
      costCents: 5_400_000,
      otherCost: null,
    })
    expect(ask.asked[0]).toContain("The trip starts on 2026-03-04 and lasts 5 days.")
    expect(ask.asked[0]).toContain("HG-88231")
  })

  it("reads an answer wrapped in a code fence", async () => {
    const ask = answering(`\`\`\`json\n${JSON.stringify({ ...HOTEL_ANSWER, kind: "flight", nights: 2 })}\n\`\`\``)
    const draft = await readBookingEmail(anna.id, { tripId, text: HOTEL_EMAIL }, { database, ask })
    const flight = (await listTypes(anna.id, database)).find((type) => type.builtin === "flight")!
    expect(draft.typeId).toBe(flight.id)
    // Nights belong to a stay only.
    expect(draft.nights).toBeNull()
  })

  it("puts a date off the trip, or no date, in Ideas", async () => {
    for (const date of ["2026-03-20", "2026-03-03", null]) {
      const draft = await readBookingEmail(
        anna.id,
        { tripId, text: HOTEL_EMAIL },
        { database, ask: answering({ ...HOTEL_ANSWER, date }) }
      )
      expect(draft.day).toBeNull()
    }
  })

  it("copies a price only in the trip's money", async () => {
    const draft = await readBookingEmail(
      anna.id,
      { tripId, text: HOTEL_EMAIL },
      { database, ask: answering({ ...HOTEL_ANSWER, costAmount: 361.5, currency: "usd" }) }
    )
    expect(draft.costCents).toBeNull()
    expect(draft.otherCost).toEqual({ amount: 361.5, currency: "USD" })
  })

  it("empties a field the AI got wrong and trims long ones", async () => {
    const draft = await readBookingEmail(
      anna.id,
      { tripId, text: HOTEL_EMAIL },
      {
        database,
        ask: answering({
          ...HOTEL_ANSWER,
          kind: "spaceship",
          startTime: "3pm",
          nights: -1,
          title: "T".repeat(500),
        }),
      }
    )
    const other = (await listTypes(anna.id, database)).find((type) => type.builtin === "other")!
    expect(draft.typeId).toBe(other.id)
    expect(draft.startTime).toBeNull()
    expect(draft.nights).toBeNull()
    expect(draft.title).toHaveLength(200)
  })

  it("says the email couldn't be read when the answer isn't a booking", async () => {
    for (const answer of ["Sorry, I can't help with that.", "{not json}", { kind: "hotel" }]) {
      await expect(
        readBookingEmail(anna.id, { tripId, text: HOTEL_EMAIL }, { database, ask: answering(answer) })
      ).rejects.toThrow(TRAVEL_ERRORS.aiFailed)
    }
  })

  it("refuses an empty email and someone else's trip without asking the AI", async () => {
    const ask = answering(HOTEL_ANSWER)
    await expect(readBookingEmail(anna.id, { tripId, text: "   " }, { database, ask })).rejects.toThrow(
      TRAVEL_ERRORS.bookingEmailEmpty
    )
    await expect(readBookingEmail(ben.id, { tripId, text: HOTEL_EMAIL }, { database, ask })).rejects.toThrow(
      TRAVEL_ERRORS.tripNotFound
    )
    expect(ask.asked).toHaveLength(0)
  })

  it("says AI isn't set up when no provider has a key", async () => {
    vi.stubEnv("CUSTOM_SHELL_ANTHROPIC_API_KEY", "")
    vi.stubEnv("CUSTOM_SHELL_OPENAI_API_KEY", "")
    vi.stubEnv("CUSTOM_SHELL_GEMINI_API_KEY", "")
    await expect(
      readBookingEmail(anna.id, { tripId, text: HOTEL_EMAIL }, { database, ask: bookingAi(anna.id) })
    ).rejects.toThrow(TRAVEL_ERRORS.aiOff)
    const rows = await database.select().from(customShellAiUsageEvents).where(eq(customShellAiUsageEvents.userId, anna.id))
    expect(rows).toHaveLength(0)
  })
})
