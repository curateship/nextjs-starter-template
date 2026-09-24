import { PGlite } from "@electric-sql/pglite"
import { and, asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { SIGN_UPS_PER_HOUR } from "@/lib/events/sign-up-fields"
import { uuid } from "@/server/auth/security"
import {
  createEvent,
  duplicateEvent,
  updateEvent,
  type SiteEvent,
} from "@/server/events/events"
import { saveEventAndDates } from "@/server/events/repeats"
import { eventSignUps, siteEvents } from "@/server/events/schema"
import {
  EVENT_FULL,
  SIGN_UPS_CLOSED,
  listSignUps,
  removeSignUp,
  signUpBoxFor,
  signUpForEvent,
} from "@/server/events/sign-ups"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Free sign-ups. The site is on Toronto time, the cooking class starts at
 * 6pm on Thursday 1 October 2026, and "now" is noon on Wednesday 23
 * September unless a test moves it.
 */

let client: PGlite
let database: TestDatabase
let siteId: string

const september23 = new Date("2026-09-23T16:00:00Z")
/** 6pm in Toronto on 1 October, the moment the class starts. */
const classStarts = new Date("2026-10-01T22:00:00Z")
const TORONTO = "America/Toronto"

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
})

afterEach(async () => {
  await client.close()
})

async function cookingClass(
  seats: number | null,
  site: string = siteId
): Promise<SiteEvent> {
  const made = await createEvent(
    site,
    {
      title: "Cooking class",
      when: { startDate: "2026-10-01", startTime: "18:00" },
    },
    database
  )
  return updateEvent(
    site,
    made.id,
    { status: "published", takesSignUps: true, seats },
    database
  )
}

let visitor = 0
/** Each call is a different visitor, so the hourly limit stays out of the way. */
function signUp(
  eventId: string,
  email: string,
  options: { ip?: string; at?: Date; name?: string; site?: string } = {}
) {
  visitor += 1
  return signUpForEvent(
    options.site ?? siteId,
    eventId,
    { name: options.name ?? "Sam", email },
    { ip: options.ip ?? `10.0.0.${visitor}`, at: options.at ?? september23 },
    database
  )
}

function box(eventId: string, at: Date = september23) {
  return signUpBoxFor(siteId, eventId, TORONTO, at, database)
}

describe("the table", () => {
  it("keeps one live sign-up per email per event", async () => {
    const event = await cookingClass(20)
    expect(await signUp(event.id, "sam@example.com")).toEqual({
      outcome: "signed-up",
    })
    // The same answer the second time, so nobody learns who is going.
    expect(await signUp(event.id, "SAM@example.com ")).toEqual({
      outcome: "signed-up",
    })
    expect(await listSignUps(siteId, event.id, database)).toHaveLength(1)

    // The database refuses a second live row by hand too.
    await expect(
      database.insert(eventSignUps).values({
        id: uuid(),
        workspaceId: siteId,
        eventId: event.id,
        name: "Sam again",
        email: "sam@example.com",
        createdAt: new Date(),
      })
    ).rejects.toThrow()
  })

  it("keeps the name on one line, without characters the database refuses", async () => {
    const event = await cookingClass(20)
    await signUp(event.id, "sam@example.com", { name: " Sam\u0000\n  Smith " })
    const [person] = await listSignUps(siteId, event.id, database)
    expect(person?.name).toBe("Sam Smith")
  })

  it("refuses a name of only invisible characters, and an email with one in it", async () => {
    const event = await cookingClass(20)
    expect(
      await signUp(event.id, "sam@example.com", { name: "\u0000\u0007" })
    ).toEqual({
      outcome: "refused",
      problem: "Enter your name.",
    })
    expect(await signUp(event.id, "sam\u0000@example.com")).toEqual({
      outcome: "refused",
      problem: "Enter a valid email address.",
    })
    expect(await listSignUps(siteId, event.id, database)).toEqual([])
  })

  it("refuses a missing name or a broken email before counting anything", async () => {
    const event = await cookingClass(20)
    expect(await signUp(event.id, "sam@example.com", { name: " " })).toEqual({
      outcome: "refused",
      problem: "Enter your name.",
    })
    expect(await signUp(event.id, "not-an-email")).toEqual({
      outcome: "refused",
      problem: "Enter a valid email address.",
    })
    // Neither typo spent any of the hour's eight.
    const ip = "10.9.9.9"
    for (let i = 0; i < 20; i += 1) {
      await signUpForEvent(
        siteId,
        event.id,
        { name: "", email: "x@example.com" },
        { ip, at: september23 },
        database
      )
    }
    expect(await signUp(event.id, "fresh@example.com", { ip })).toEqual({
      outcome: "signed-up",
    })
  })
})

describe("seats", () => {
  it("gives the last seat to one of two people racing for it", async () => {
    const event = await cookingClass(1)
    const results = await Promise.all([
      signUp(event.id, "first@example.com"),
      signUp(event.id, "second@example.com"),
    ])
    expect(results.filter((each) => each.outcome === "signed-up")).toHaveLength(
      1
    )
    expect(results).toContainEqual({ outcome: "refused", problem: EVENT_FULL })
    expect(await listSignUps(siteId, event.id, database)).toHaveLength(1)
  })

  it("takes the twenty-first person as full", async () => {
    const event = await cookingClass(20)
    for (let i = 1; i <= 20; i += 1) {
      await signUp(event.id, `cook${i}@example.com`)
    }
    expect(await signUp(event.id, "cook21@example.com")).toEqual({
      outcome: "refused",
      problem: EVENT_FULL,
    })
  })

  it("has no limit with the seats left empty", async () => {
    const event = await cookingClass(null)
    for (let i = 1; i <= 30; i += 1) {
      await signUp(event.id, `guest${i}@example.com`)
    }
    expect(await box(event.id)).toEqual({
      seats: null,
      left: null,
      full: false,
      closed: false,
    })
  })

  it("says full, and removes nobody, when the seats are lowered below the list", async () => {
    const event = await cookingClass(3)
    for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
      await signUp(event.id, email)
    }
    await updateEvent(siteId, event.id, { seats: 2 }, database)
    expect(await box(event.id)).toMatchObject({ left: 0, full: true })
    expect(await listSignUps(siteId, event.id, database)).toHaveLength(3)
  })
})

describe("the sign-up box", () => {
  it("shows the seats left, then full, then closed once the event starts", async () => {
    const event = await cookingClass(2)
    expect(await box(event.id)).toEqual({
      seats: 2,
      left: 2,
      full: false,
      closed: false,
    })

    await signUp(event.id, "a@example.com")
    expect(await box(event.id)).toMatchObject({ left: 1, full: false })

    await signUp(event.id, "b@example.com")
    expect(await box(event.id)).toMatchObject({ left: 0, full: true })

    expect(await box(event.id, classStarts)).toMatchObject({ closed: true })
    // A minute earlier it is still open.
    expect(
      await box(event.id, new Date(classStarts.getTime() - 60_000))
    ).toMatchObject({ closed: false })
  })

  it("closes sign-ups when the event starts", async () => {
    const event = await cookingClass(20)
    expect(
      await signUp(event.id, "late@example.com", { at: classStarts })
    ).toEqual({ outcome: "refused", problem: SIGN_UPS_CLOSED })
  })

  it("is not there when the event takes no sign-ups, or is a draft", async () => {
    const event = await cookingClass(20)
    await updateEvent(siteId, event.id, { takesSignUps: false }, database)
    expect(await box(event.id)).toBeNull()
    expect(await signUp(event.id, "a@example.com")).toMatchObject({
      outcome: "refused",
    })

    await updateEvent(
      siteId,
      event.id,
      { takesSignUps: true, status: "draft" },
      database
    )
    expect(await box(event.id)).toBeNull()
    expect(await signUp(event.id, "a@example.com")).toMatchObject({
      outcome: "refused",
    })
  })
})

describe("the spam limit", () => {
  it("refuses the ninth sign-up in an hour from one address, in plain words", async () => {
    const one = await cookingClass(null)
    const other = await cookingClass(null)
    const ip = "10.1.1.1"
    for (let i = 1; i <= SIGN_UPS_PER_HOUR; i += 1) {
      // Split over two events: the limit is per site, not per event.
      const result = await signUp(
        i % 2 ? one.id : other.id,
        `p${i}@example.com`,
        {
          ip,
        }
      )
      expect(result).toEqual({ outcome: "signed-up" })
    }
    expect(await signUp(one.id, "ninth@example.com", { ip })).toEqual({
      outcome: "refused",
      problem:
        "You have signed up 8 times in the last hour, which is as many as this site takes. Please try again in an hour.",
    })
    // Another address is not held up by it.
    expect(await signUp(one.id, "ninth@example.com")).toEqual({
      outcome: "signed-up",
    })
  })
})

describe("who's coming", () => {
  it("lists the people, first to sign up first", async () => {
    const event = await cookingClass(20)
    await signUp(event.id, "ana@example.com", {
      name: "Ana",
      at: new Date("2026-09-20T10:00:00Z"),
    })
    await signUp(event.id, "bo@example.com", { name: "Bo" })
    const list = await listSignUps(siteId, event.id, database)
    expect(list.map((person) => person.name)).toEqual(["Ana", "Bo"])
  })

  it("frees the seat when somebody is removed, and lets them sign up again", async () => {
    const event = await cookingClass(1)
    await signUp(event.id, "ana@example.com", { name: "Ana" })
    expect(await signUp(event.id, "bo@example.com")).toMatchObject({
      outcome: "refused",
    })

    const [ana] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, ana!.id, database)
    expect(await box(event.id)).toMatchObject({ left: 1, full: false })
    expect(await listSignUps(siteId, event.id, database)).toEqual([])

    // The removed row stays as a record, and the same email can come back.
    expect(await signUp(event.id, "ana@example.com")).toEqual({
      outcome: "signed-up",
    })
    const rows = await database
      .select({ status: eventSignUps.status })
      .from(eventSignUps)
      .where(eq(eventSignUps.eventId, event.id))
      .orderBy(asc(eventSignUps.createdAt))
    expect(rows.map((row) => row.status).sort()).toEqual([
      "cancelled",
      "confirmed",
    ])
  })

  it("says so when the person was already removed", async () => {
    const event = await cookingClass(5)
    await signUp(event.id, "ana@example.com")
    const [ana] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, ana!.id, database)
    await expect(removeSignUp(siteId, ana!.id, database)).rejects.toThrow(
      "That person is no longer on the list."
    )
  })
})

describe("one site never touches another's", () => {
  it("keeps sign-ups, lists and removals on their own site", async () => {
    const beta = (await insertWorkspace(database, { name: "Beta" })).id
    const betaClass = await cookingClass(5, beta)

    // Alpha's address cannot sign up for beta's event.
    expect(await signUp(betaClass.id, "a@example.com")).toMatchObject({
      outcome: "refused",
    })

    await signUp(betaClass.id, "b@example.com", { site: beta })
    const [person] = await listSignUps(beta, betaClass.id, database)
    expect(await listSignUps(siteId, betaClass.id, database)).toEqual([])
    await expect(removeSignUp(siteId, person!.id, database)).rejects.toThrow()
    expect(await listSignUps(beta, betaClass.id, database)).toHaveLength(1)
  })
})

describe("copies and repeats", () => {
  it("copies the settings to a duplicate, never the people", async () => {
    const event = await cookingClass(12)
    await signUp(event.id, "a@example.com")
    const copy = await duplicateEvent(siteId, event.id, database)
    expect(copy).toMatchObject({ takesSignUps: true, seats: 12 })
    expect(await listSignUps(siteId, copy.id, database)).toEqual([])
  })

  it("gives each date of a repeat its own seats, and keeps a date somebody signed up for when the repeat changes", async () => {
    const made = await createEvent(
      siteId,
      {
        title: "Trivia night",
        when: { startDate: "2026-10-01", startTime: "19:00" },
      },
      database
    )
    await saveEventAndDates(
      siteId,
      made.id,
      {
        status: "published",
        takesSignUps: true,
        seats: 10,
        repeat: { freq: "weekly", weekdays: [4], until: null },
      },
      database,
      september23
    )
    const dates = await database
      .select()
      .from(siteEvents)
      .where(eq(siteEvents.seriesId, made.id))
      .orderBy(asc(siteEvents.seriesDate))
    expect(dates[0]).toMatchObject({ takesSignUps: true, seats: 10 })

    const october15 = dates.find((date) => date.startDate === "2026-10-15")!
    await signUp(october15.id, "a@example.com")
    expect(await box(made.id)).toMatchObject({ left: 10 })
    expect(await box(october15.id)).toMatchObject({ left: 9 })

    // Stopping the repeat deletes the future dates, except the one with a
    // sign-up on it.
    const saved = await saveEventAndDates(
      siteId,
      made.id,
      { repeat: null },
      database,
      september23
    )
    expect(saved.keptForSignUps).toEqual(["2026-10-15"])
    const left = await database
      .select({ id: siteEvents.id })
      .from(siteEvents)
      .where(and(eq(siteEvents.seriesId, made.id)))
    expect(left.map((row) => row.id)).toEqual([october15.id])
    expect(await listSignUps(siteId, october15.id, database)).toHaveLength(1)
  })
})
