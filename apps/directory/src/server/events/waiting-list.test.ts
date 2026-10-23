import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/directory/mail", () => ({
  sendDirectoryEmail: vi.fn(async () => ({ delivered: true })),
}))

import { sendDirectoryEmail } from "@/server/directory/mail"
import {
  createEvent,
  updateEvent,
  type SiteEvent,
} from "@/server/events/events"
import { eventSignUps } from "@/server/events/schema"
import {
  listSignUps,
  listWaitingList,
  removeSignUp,
  signUpBoxFor,
  signUpForEvent,
} from "@/server/events/sign-ups"
import {
  claimOfferedSeat,
  holdUntil,
  runWaitingListPass,
} from "@/server/events/waiting-list"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The waiting list. Same cooking class as `sign-ups.test.ts`: the site is on
 * Toronto time, the class starts at 6pm on Thursday 1 October 2026, and "now"
 * is noon on Wednesday 23 September unless a test moves it.
 *
 * The emails are mocked, so what these tests check is who was offered what and
 * when, not what the message said.
 */

let client: PGlite
let database: TestDatabase
let siteId: string

const september23 = new Date("2026-09-23T16:00:00Z")
/** 6pm in Toronto on 1 October, the moment the class starts. */
const classStarts = new Date("2026-10-01T22:00:00Z")
const TORONTO = "America/Toronto"
const AN_HOUR = 60 * 60 * 1000

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
  vi.mocked(sendDirectoryEmail).mockClear()
  vi.mocked(sendDirectoryEmail).mockResolvedValue({ delivered: true })
})

afterEach(async () => {
  await client.close()
})

async function cookingClass(seats: number | null): Promise<SiteEvent> {
  const made = await createEvent(
    siteId,
    {
      title: "Cooking class",
      when: { startDate: "2026-10-01", startTime: "18:00" },
    },
    database
  )
  return updateEvent(
    siteId,
    made.id,
    { status: "published", takesSignUps: true, seats },
    database
  )
}

let visitor = 0
/**
 * Each call is a different visitor a second later than the last, so the queue
 * has one plain order rather than one decided by which id sorted first.
 */
function signUp(eventId: string, email: string, at: Date = september23) {
  visitor += 1
  return signUpForEvent(
    siteId,
    eventId,
    { name: email.split("@")[0] ?? "Sam", email },
    {
      ip: `10.0.0.${visitor % 250}`,
      at: new Date(at.getTime() + visitor * 1000),
    },
    database
  )
}

function box(eventId: string, at: Date = september23) {
  return signUpBoxFor(siteId, eventId, TORONTO, at, database)
}

/** Every row for one event, in the order they joined, as status by email. */
async function states(eventId: string) {
  const rows = await database
    .select({
      email: eventSignUps.email,
      status: eventSignUps.status,
      expiresAt: eventSignUps.offerExpiresAt,
    })
    .from(eventSignUps)
    .where(eq(eventSignUps.eventId, eventId))
    .orderBy(eventSignUps.createdAt, eventSignUps.id)
  return rows
}

/** The token the offer email carried, read out of the mocked send. */
function tokensSent(): string[] {
  return vi
    .mocked(sendDirectoryEmail)
    .mock.calls.map(
      ([email]) =>
        new URL(email.action?.url ?? "http://x/").searchParams.get("token") ??
        ""
    )
}

/** A full class of one, with `waiting` people queued behind the one seat. */
async function fullClassWithQueue(waiting: string[]) {
  const event = await cookingClass(1)
  await signUp(event.id, "seated@example.com")
  for (const email of waiting) await signUp(event.id, email)
  return event
}

describe("joining the waiting list", () => {
  it("queues the person who finds the event full, and tells them their place", async () => {
    const event = await cookingClass(1)
    expect(await signUp(event.id, "first@example.com")).toEqual({
      outcome: "signed-up",
    })
    expect(await signUp(event.id, "second@example.com")).toEqual({
      outcome: "waiting",
      place: 1,
    })
    expect(await signUp(event.id, "third@example.com")).toEqual({
      outcome: "waiting",
      place: 2,
    })
    // Nobody waiting is coming, and nobody waiting holds a seat.
    expect(await listSignUps(siteId, event.id, database)).toHaveLength(1)
    expect(await box(event.id)).toMatchObject({ left: 0, full: true })
  })

  it("offers the waiting list only while the event is full and has not started", async () => {
    const event = await cookingClass(1)
    expect(await box(event.id)).toMatchObject({
      full: false,
      waitingList: false,
    })
    await signUp(event.id, "first@example.com")
    expect(await box(event.id)).toMatchObject({
      full: true,
      waitingList: true,
    })
    expect(await box(event.id, classStarts)).toMatchObject({
      closed: true,
      waitingList: false,
    })
  })

  it("never queues anybody when the seats are left empty", async () => {
    const event = await cookingClass(null)
    for (let i = 1; i <= 30; i += 1) {
      expect(await signUp(event.id, `guest${i}@example.com`)).toEqual({
        outcome: "signed-up",
      })
    }
    expect(await listWaitingList(siteId, event.id, database)).toHaveLength(0)
  })

  it("tells somebody already waiting their real place, and writes nothing", async () => {
    const event = await fullClassWithQueue([
      "one@example.com",
      "two@example.com",
    ])
    expect(await signUp(event.id, "TWO@example.com ")).toEqual({
      outcome: "waiting",
      place: 2,
    })
    expect(await states(event.id)).toHaveLength(3)
  })

  it("tells somebody holding an offer that their link is already out", async () => {
    const event = await fullClassWithQueue(["one@example.com"])
    const [seated] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, seated!.id, database)
    await runWaitingListPass(september23, database)

    expect(await signUp(event.id, "one@example.com")).toEqual({
      outcome: "offered",
    })
  })
})

describe("offering a freed seat", () => {
  it("gives two seats freed at once to the first two people", async () => {
    const event = await cookingClass(2)
    await signUp(event.id, "a@example.com")
    await signUp(event.id, "b@example.com")
    for (const email of [
      "one@example.com",
      "two@example.com",
      "three@example.com",
    ]) {
      await signUp(event.id, email)
    }

    const coming = await listSignUps(siteId, event.id, database)
    for (const person of coming) await removeSignUp(siteId, person.id, database)
    await runWaitingListPass(september23, database)

    expect(await states(event.id)).toMatchObject([
      { email: "a@example.com", status: "cancelled" },
      { email: "b@example.com", status: "cancelled" },
      { email: "one@example.com", status: "offered" },
      { email: "two@example.com", status: "offered" },
      { email: "three@example.com", status: "waiting" },
    ])
    expect(sendDirectoryEmail).toHaveBeenCalledTimes(2)
  })

  it("keeps the event full while an offer is open, so nobody takes the seat", async () => {
    const event = await fullClassWithQueue(["one@example.com"])
    const [seated] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, seated!.id, database)
    await runWaitingListPass(september23, database)

    expect(await box(event.id)).toMatchObject({ left: 0, full: true })
    // And the person who was offered it is not counted as coming yet.
    expect(await listSignUps(siteId, event.id, database)).toHaveLength(0)
  })

  it("offers the new seats when the seat count is raised", async () => {
    const event = await fullClassWithQueue([
      "one@example.com",
      "two@example.com",
    ])
    await updateEvent(siteId, event.id, { seats: 2 }, database)
    await runWaitingListPass(september23, database)

    expect(await states(event.id)).toMatchObject([
      { status: "confirmed" },
      { email: "one@example.com", status: "offered" },
      { email: "two@example.com", status: "waiting" },
    ])
  })

  it("offers nothing on an event whose admin switched sign-ups off", async () => {
    const event = await fullClassWithQueue(["one@example.com"])
    const [seated] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, seated!.id, database)
    await updateEvent(siteId, event.id, { takesSignUps: false }, database)
    await runWaitingListPass(september23, database)

    expect(await states(event.id)).toMatchObject([
      { status: "cancelled" },
      { email: "one@example.com", status: "waiting" },
    ])
  })

  it("puts somebody back at their place when the email fails", async () => {
    const event = await fullClassWithQueue([
      "one@example.com",
      "two@example.com",
    ])
    const [seated] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, seated!.id, database)

    vi.mocked(sendDirectoryEmail).mockRejectedValueOnce(
      new Error("The email could not be sent.")
    )
    await runWaitingListPass(september23, database)
    expect(await states(event.id)).toMatchObject([
      { status: "cancelled" },
      { email: "one@example.com", status: "waiting" },
      { email: "two@example.com", status: "waiting" },
    ])

    // The next pass tries again, and the front of the queue is unchanged.
    await runWaitingListPass(september23, database)
    expect(await states(event.id)).toMatchObject([
      { status: "cancelled" },
      { email: "one@example.com", status: "offered" },
      { email: "two@example.com", status: "waiting" },
    ])
  })
})

describe("how long a seat is held", () => {
  it("holds it for a day when the event is more than a day off", async () => {
    const until = holdUntil(
      { startDate: "2026-10-01", startTime: "18:00" },
      TORONTO,
      september23
    )
    expect(until).toEqual(new Date(september23.getTime() + 24 * AN_HOUR))
  })

  it("holds it only to two hours before a class starting sooner than that", async () => {
    const theMorning = new Date("2026-10-01T13:00:00Z")
    const until = holdUntil(
      { startDate: "2026-10-01", startTime: "18:00" },
      TORONTO,
      theMorning
    )
    expect(until).toEqual(new Date(classStarts.getTime() - 2 * AN_HOUR))
  })

  it("offers nothing inside the last two hours, so the seat goes back on the page", async () => {
    const event = await fullClassWithQueue(["one@example.com"])
    const [seated] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, seated!.id, database)

    const anHourBefore = new Date(classStarts.getTime() - AN_HOUR)
    await runWaitingListPass(anHourBefore, database)
    expect(await states(event.id)).toMatchObject([
      { status: "cancelled" },
      { email: "one@example.com", status: "waiting" },
    ])
    expect(sendDirectoryEmail).not.toHaveBeenCalled()
    expect(await box(event.id, anHourBefore)).toMatchObject({
      left: 1,
      full: false,
    })
  })
})

describe("claiming a seat", () => {
  async function offerTo(waiting: string[]) {
    const event = await fullClassWithQueue(waiting)
    const [seated] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, seated!.id, database)
    await runWaitingListPass(september23, database)
    return { event, token: tokensSent()[0] ?? "" }
  }

  it("turns the offer into a seat", async () => {
    const { event, token } = await offerTo(["one@example.com"])
    expect(await claimOfferedSeat(token, september23, database)).toMatchObject({
      outcome: "claimed",
      title: "Cooking class",
    })

    const coming = await listSignUps(siteId, event.id, database)
    expect(coming.map((person) => person.email)).toEqual(["one@example.com"])
    expect(await listWaitingList(siteId, event.id, database)).toHaveLength(0)
  })

  it("says so on a second click rather than pretending not to know the link", async () => {
    const { token } = await offerTo(["one@example.com"])
    await claimOfferedSeat(token, september23, database)
    expect(await claimOfferedSeat(token, september23, database)).toMatchObject({
      outcome: "already",
    })
  })

  it("refuses a link whose hold has run out, without needing the pass first", async () => {
    const { token } = await offerTo(["one@example.com"])
    const tooLate = new Date(september23.getTime() + 25 * AN_HOUR)
    expect(await claimOfferedSeat(token, tooLate, database)).toMatchObject({
      outcome: "ran-out",
    })
  })

  it("refuses a link once the event has started", async () => {
    const { token } = await offerTo(["one@example.com"])
    expect(await claimOfferedSeat(token, classStarts, database)).toMatchObject({
      outcome: "started",
    })
  })

  it("refuses a link belonging to somebody an admin has removed", async () => {
    const { event, token } = await offerTo(["one@example.com"])
    const [offered] = await listWaitingList(siteId, event.id, database)
    await removeSignUp(siteId, offered!.id, database)
    expect(await claimOfferedSeat(token, september23, database)).toMatchObject({
      outcome: "ran-out",
    })
  })

  it("knows nothing of an invented token", async () => {
    expect(
      await claimOfferedSeat("not-a-real-token", september23, database)
    ).toEqual({ outcome: "unknown" })
  })
})

describe("a hold that runs out", () => {
  it("offers the seat to the next person and takes the first one off the list", async () => {
    const event = await fullClassWithQueue([
      "one@example.com",
      "two@example.com",
    ])
    const [seated] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, seated!.id, database)
    await runWaitingListPass(september23, database)
    expect(await states(event.id)).toMatchObject([
      { status: "cancelled" },
      { email: "one@example.com", status: "offered" },
      { email: "two@example.com", status: "waiting" },
    ])

    const nextDay = new Date(september23.getTime() + 25 * AN_HOUR)
    await runWaitingListPass(nextDay, database)
    expect(await states(event.id)).toMatchObject([
      { status: "cancelled" },
      { email: "one@example.com", status: "expired" },
      { email: "two@example.com", status: "offered" },
    ])
  })

  it("lets the person who missed it sign up again while a seat is free", async () => {
    const event = await fullClassWithQueue(["one@example.com"])
    const [seated] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, seated!.id, database)
    await runWaitingListPass(september23, database)

    const nextDay = new Date(september23.getTime() + 25 * AN_HOUR)
    await runWaitingListPass(nextDay, database)
    // Nobody left waiting, so the seat is back on the page for anybody.
    expect(await box(event.id, nextDay)).toMatchObject({ left: 1, full: false })
    expect(await signUp(event.id, "one@example.com", nextDay)).toEqual({
      outcome: "signed-up",
    })
    expect(
      await database
        .select({ id: eventSignUps.id })
        .from(eventSignUps)
        .where(
          and(
            eq(eventSignUps.eventId, event.id),
            eq(eventSignUps.email, "one@example.com")
          )
        )
    ).toHaveLength(2)
  })
})

describe("the admin's lists", () => {
  it("shows the queue front first, with the held seat's deadline on it", async () => {
    const event = await fullClassWithQueue([
      "one@example.com",
      "two@example.com",
    ])
    const [seated] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, seated!.id, database)
    await runWaitingListPass(september23, database)

    const queue = await listWaitingList(siteId, event.id, database)
    expect(queue.map((person) => person.email)).toEqual([
      "one@example.com",
      "two@example.com",
    ])
    expect(queue[0]?.offerExpiresAt).toEqual(
      new Date(september23.getTime() + 24 * AN_HOUR)
    )
    expect(queue[1]?.offerExpiresAt).toBeNull()
  })

  it("frees a held seat when the offered person is removed", async () => {
    const event = await fullClassWithQueue([
      "one@example.com",
      "two@example.com",
    ])
    const [seated] = await listSignUps(siteId, event.id, database)
    await removeSignUp(siteId, seated!.id, database)
    await runWaitingListPass(september23, database)

    const [offered] = await listWaitingList(siteId, event.id, database)
    await removeSignUp(siteId, offered!.id, database)
    await runWaitingListPass(september23, database)
    expect(await states(event.id)).toMatchObject([
      { status: "cancelled" },
      { email: "one@example.com", status: "cancelled" },
      { email: "two@example.com", status: "offered" },
    ])
  })
})
