import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/directory/mail", () => ({
  sendDirectoryEmail: vi.fn(async () => ({ delivered: true })),
}))

import { eventJsonLd } from "@/lib/directory/public-seo"
import { eventCalendarFile } from "@/lib/events/calendar-file"
import { hashToken } from "@/server/auth/security"
import { sendDirectoryEmail } from "@/server/directory/mail"
import { createEvent, duplicateEvent, updateEvent, type SiteEvent } from "@/server/events/events"
import { readPublicEvent } from "@/server/events/public"
import { resetPublicDirectoryCacheForTests } from "@/server/directory/public-cache"
import { saveEventAndDates } from "@/server/events/repeats"
import { changeEventSchedule, movedEnd, noticeEmail, runEventNoticePass } from "@/server/events/schedule"
import { eventSignUps, siteEvents } from "@/server/events/schema"
import { removeSignUp, signUpBoxFor, signUpForEvent } from "@/server/events/sign-ups"
import { claimOfferedSeat } from "@/server/events/waiting-list"
import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"

/**
 * Cancelled or postponed events (task events/27). A storm cancels an outdoor
 * concert on 5 June 2099, at 7pm on the site's Toronto clock. "Now" is noon on
 * 1 June 2099 unless a test moves it. The emails are mocked, so these tests
 * check who was emailed what, and how many times.
 */

let client: PGlite
let database: TestDatabase
let siteId: string

const june1 = new Date("2099-06-01T16:00:00Z")
const TORONTO = "America/Toronto"

beforeEach(async () => {
  resetPublicDirectoryCacheForTests()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
  vi.mocked(sendDirectoryEmail).mockClear()
  vi.mocked(sendDirectoryEmail).mockResolvedValue({ delivered: true })
})

afterEach(async () => {
  resetPublicDirectoryCacheForTests()
  await client.close()
})

async function concert(seats: number | null = null): Promise<SiteEvent> {
  const made = await createEvent(
    siteId,
    { title: "Park concert", when: { startDate: "2099-06-05", startTime: "19:00" } },
    database
  )
  return updateEvent(
    siteId,
    made.id,
    { status: "published", takesSignUps: true, seats, placeName: "Trinity Bellwoods Park" },
    database
  )
}

let ip = 0
function signUp(event: SiteEvent, name: string) {
  ip += 1
  return signUpForEvent(
    siteId,
    event.id,
    { name, email: `${name.toLowerCase()}@example.com` },
    { ip: `10.0.0.${ip}`, at: june1 },
    database
  )
}

function emailedTo(): string[] {
  return vi
    .mocked(sendDirectoryEmail)
    .mock.calls.map(([email]) => email.to)
    .sort()
}

describe("changing the status", () => {
  it("cancels, and saving it twice changes nothing more", async () => {
    const event = await concert()
    const first = await changeEventSchedule(siteId, event.id, { status: "cancelled" }, database)
    const second = await changeEventSchedule(siteId, event.id, { status: "cancelled" }, database)

    expect(first.scheduleStatus).toBe("cancelled")
    expect(second.scheduleStatus).toBe("cancelled")
    const [row] = await database.select().from(siteEvents).where(eq(siteEvents.id, event.id))
    expect(row?.noticeNumber).toBe(1)
    expect(row?.notice).toBe("cancelled")
  })

  it("a new date on a postponed event moves it and keeps where it was", async () => {
    const event = await concert()
    await changeEventSchedule(siteId, event.id, { status: "postponed" }, database)
    const back = await changeEventSchedule(
      siteId,
      event.id,
      { status: "scheduled", when: { startDate: "2099-06-12", startTime: "18:30" } },
      database
    )
    expect(back).toMatchObject({
      scheduleStatus: "scheduled",
      startDate: "2099-06-12",
      startTime: "18:30",
      rescheduledFrom: { date: "2099-06-05", time: "19:00" },
    })
    const [row] = await database.select().from(siteEvents).where(eq(siteEvents.id, event.id))
    expect(row?.notice).toBe("rescheduled")
    expect(row?.noticeNumber).toBe(2)
  })

  it("the same date puts it back on without a Rescheduled note", async () => {
    const event = await concert()
    await changeEventSchedule(siteId, event.id, { status: "cancelled" }, database)
    const back = await changeEventSchedule(
      siteId,
      event.id,
      { status: "scheduled", when: { startDate: "2099-06-05", startTime: "19:00" } },
      database
    )
    expect(back.rescheduledFrom).toBeNull()
    const [row] = await database.select().from(siteEvents).where(eq(siteEvents.id, event.id))
    expect(row?.notice).toBe("back-on")
  })

  it("moves a festival's end day with its start", async () => {
    const made = await createEvent(
      siteId,
      {
        title: "Festival",
        when: { startDate: "2099-06-05", startTime: "12:00", endDate: "2099-06-07", endTime: "20:00" },
      },
      database
    )
    await changeEventSchedule(siteId, made.id, { status: "postponed" }, database)
    const back = await changeEventSchedule(
      siteId,
      made.id,
      { status: "scheduled", when: { startDate: "2099-07-10", startTime: "12:00" } },
      database
    )
    expect(back).toMatchObject({ startDate: "2099-07-10", endDate: "2099-07-12", endTime: "20:00" })
  })

  it("keeps a concert's length when its time moves", async () => {
    const made = await createEvent(
      siteId,
      { title: "Late show", when: { startDate: "2099-06-05", startTime: "19:00", endTime: "22:00" } },
      database
    )
    await changeEventSchedule(siteId, made.id, { status: "postponed" }, database)
    const later = await changeEventSchedule(
      siteId,
      made.id,
      { status: "scheduled", when: { startDate: "2099-06-05", startTime: "20:30" } },
      database
    )
    expect(later).toMatchObject({ startTime: "20:30", endTime: "23:30" })
  })

  it("rolls a late end onto the next day", () => {
    expect(
      movedEnd(
        { startDate: "2099-06-05", startTime: "21:00", endDate: "2099-06-05", endTime: "23:30" },
        { startDate: "2099-06-05", startTime: "23:00" }
      )
    ).toEqual({ endDate: "2099-06-06", endTime: "01:30" })
  })

  it("never moves the day of a repeating event's main event", async () => {
    const event = await concert()
    await saveEventAndDates(
      siteId,
      event.id,
      // 5 June 2099 is a Friday.
      { repeat: { freq: "weekly", weekdays: [5], until: null } },
      database,
      june1
    )
    await changeEventSchedule(siteId, event.id, { status: "postponed" }, database)
    await expect(
      changeEventSchedule(
        siteId,
        event.id,
        { status: "scheduled", when: { startDate: "2099-06-10", startTime: "19:00" } },
        database
      )
    ).rejects.toThrow("This event repeats.")
  })

  it("a duplicate of a cancelled event is going ahead", async () => {
    const event = await concert()
    await changeEventSchedule(siteId, event.id, { status: "cancelled" }, database)
    const copy = await duplicateEvent(siteId, event.id, database)
    expect(copy.scheduleStatus).toBe("scheduled")
  })

  it("is refused for another site's event", async () => {
    const event = await concert()
    const other = (await insertWorkspace(database, { name: "Beta" })).id
    await expect(changeEventSchedule(other, event.id, { status: "cancelled" }, database)).rejects.toThrow(
      "That event no longer exists."
    )
  })
})

describe("sign-ups close", () => {
  it("the box closes and a sign-up is refused while it is off", async () => {
    const event = await concert()
    await changeEventSchedule(siteId, event.id, { status: "cancelled" }, database)

    const box = await signUpBoxFor(siteId, event.id, TORONTO, june1, database)
    expect(box).toMatchObject({ closed: true, waitingList: false })
    expect(await signUp(event, "Sam")).toEqual({
      outcome: "refused",
      problem: "This event is cancelled, so it is not taking sign-ups.",
    })
  })

  it("they open again when it is back on", async () => {
    const event = await concert()
    await changeEventSchedule(siteId, event.id, { status: "postponed" }, database)
    await changeEventSchedule(siteId, event.id, { status: "scheduled" }, database)
    expect(await signUp(event, "Sam")).toEqual({ outcome: "signed-up" })
  })

  it("a seat offered from the waiting list can't be claimed once it is cancelled", async () => {
    const event = await concert(1)
    await signUp(event, "Ana")
    await signUp(event, "Ben")
    // Ana's seat frees, so Ben is offered it, then the concert is cancelled.
    const [ana] = await database.select().from(eventSignUps).where(eq(eventSignUps.email, "ana@example.com"))
    await removeSignUp(siteId, ana!.id, database)
    await database
      .update(eventSignUps)
      .set({ status: "offered", offerTokenHash: hashToken("t0ken"), offerExpiresAt: new Date("2099-06-02T00:00:00Z") })
      .where(eq(eventSignUps.email, "ben@example.com"))
    await changeEventSchedule(siteId, event.id, { status: "cancelled" }, database)

    expect(await claimOfferedSeat("t0ken", june1, database)).toMatchObject({ outcome: "off", status: "cancelled" })
    // Ben keeps his place: back on the waiting list, not run out.
    const [ben] = await database.select().from(eventSignUps).where(eq(eventSignUps.email, "ben@example.com"))
    expect(ben?.status).toBe("waiting")
  })
})

describe("telling everyone", () => {
  it("emails everybody on the list once, even when the status is saved twice", async () => {
    const event = await concert(2)
    await signUp(event, "Ana")
    await signUp(event, "Ben")
    await signUp(event, "Cy") // the waiting list
    await signUp(event, "Dee")
    const [dee] = await database.select().from(eventSignUps).where(eq(eventSignUps.email, "dee@example.com"))
    await removeSignUp(siteId, dee!.id, database)

    await changeEventSchedule(siteId, event.id, { status: "cancelled" }, database)
    await changeEventSchedule(siteId, event.id, { status: "cancelled" }, database)
    await runEventNoticePass(database)
    await runEventNoticePass(database)

    // Dee was taken off the list, so Dee hears nothing.
    expect(emailedTo()).toEqual(["ana@example.com", "ben@example.com", "cy@example.com"])
    const [first] = vi.mocked(sendDirectoryEmail).mock.calls[0]!
    expect(first.subject).toBe("Cancelled: Park concert")
  })

  it("a later change is a second email, with only the latest news", async () => {
    const event = await concert()
    await signUp(event, "Ana")
    await changeEventSchedule(siteId, event.id, { status: "postponed" }, database)
    await changeEventSchedule(siteId, event.id, { status: "cancelled" }, database)
    await runEventNoticePass(database)
    expect(vi.mocked(sendDirectoryEmail).mock.calls.map(([email]) => email.subject)).toEqual([
      "Cancelled: Park concert",
    ])

    await changeEventSchedule(
      siteId,
      event.id,
      { status: "scheduled", when: { startDate: "2099-06-12", startTime: "19:00" } },
      database
    )
    await runEventNoticePass(database)
    expect(vi.mocked(sendDirectoryEmail).mock.calls.map(([email]) => email.subject)).toEqual([
      "Cancelled: Park concert",
      "New date: Park concert",
    ])
  })

  it("somebody who signs up after the new date is not told about it", async () => {
    const event = await concert()
    await changeEventSchedule(siteId, event.id, { status: "postponed" }, database)
    await changeEventSchedule(
      siteId,
      event.id,
      { status: "scheduled", when: { startDate: "2099-06-12", startTime: "19:00" } },
      database
    )
    await signUp(event, "Late")
    await runEventNoticePass(database)
    expect(emailedTo()).toEqual([])
  })

  it("an email that fails is tried again on the next pass", async () => {
    const event = await concert()
    await signUp(event, "Ana")
    await changeEventSchedule(siteId, event.id, { status: "cancelled" }, database)
    vi.mocked(sendDirectoryEmail).mockRejectedValueOnce(new Error("mail server down"))
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await runEventNoticePass(database)
    quiet.mockRestore()
    await runEventNoticePass(database)
    expect(vi.mocked(sendDirectoryEmail).mock.calls.length).toBe(2)
    const [row] = await database.select().from(eventSignUps).where(eq(eventSignUps.email, "ana@example.com"))
    expect(row?.toldNotice).toBe(1)
  })

  it("says the old and the new date when rescheduled, and keeps a waiting place", () => {
    expect(
      noticeEmail({
        name: "Cy",
        status: "waiting",
        title: "Park concert",
        startDate: "2099-06-12",
        startTime: "18:30:00",
        notice: "rescheduled",
        rescheduledFromDate: "2099-06-05",
        rescheduledFromTime: "19:00:00",
      })?.lines
    ).toEqual([
      "Hello Cy,",
      "Park concert has a new date: Friday, June 12, 2099 at 6:30 PM.",
      "It was planned for Friday, June 5, 2099 at 7:00 PM.",
      "You keep your place on the waiting list.",
    ])
  })
})

describe("what visitors and Google see", () => {
  it("the page carries the status and the date it moved from", async () => {
    const event = await concert()
    await changeEventSchedule(siteId, event.id, { status: "postponed" }, database)
    await changeEventSchedule(
      siteId,
      event.id,
      { status: "scheduled", when: { startDate: "2099-06-12", startTime: "19:00" } },
      database
    )
    const site = { id: siteId, name: "Alpha", url: "https://alpha.example.com" }
    const page = await readPublicEvent(site, event.slug, database)
    expect(page?.event).toMatchObject({
      scheduleStatus: "scheduled",
      rescheduledFrom: { date: "2099-06-05", time: "19:00" },
    })
  })

  it("Google is told cancelled, postponed or rescheduled", () => {
    const base = {
      siteName: "Alpha",
      siteUrl: "https://alpha.example.com",
      timeZone: TORONTO,
      title: "Park concert",
      slug: "park-concert",
      summary: "",
      image: "",
      placeName: "Trinity Bellwoods Park",
      placeAddress: "",
      startDate: "2099-06-12",
      startTime: "19:00",
      endDate: null,
      endTime: null,
    }
    const eventNode = (input: Parameters<typeof eventJsonLd>[0]) =>
      ((eventJsonLd(input)?.["@graph"] as Record<string, unknown>[]) ?? [])[1]

    expect(eventNode({ ...base, scheduleStatus: "cancelled" })?.eventStatus).toBe("https://schema.org/EventCancelled")
    expect(eventNode({ ...base, scheduleStatus: "postponed" })?.eventStatus).toBe("https://schema.org/EventPostponed")
    const moved = eventNode({ ...base, scheduleStatus: "scheduled", rescheduledFrom: { date: "2099-06-05", time: "19:00" } })
    expect(moved?.eventStatus).toBe("https://schema.org/EventRescheduled")
    expect(moved?.previousStartDate).toBe("2099-06-05T19:00:00-04:00")
    expect(eventNode({ ...base, scheduleStatus: "scheduled", rescheduledFrom: null })?.eventStatus).toBe(
      "https://schema.org/EventScheduled"
    )
  })

  it("a calendar file marks a cancelled event cancelled", () => {
    const file = eventCalendarFile(
      [
        {
          id: "e1",
          title: "Park concert",
          summary: "",
          placeName: "",
          placeAddress: "",
          url: "https://alpha.example.com/events/park-concert",
          startDate: "2099-06-05",
          startTime: "19:00",
          endDate: null,
          endTime: null,
          cancelled: true,
        },
      ],
      { siteName: "Alpha", timeZone: TORONTO, now: june1 }
    )
    expect(file).toContain("STATUS:CANCELLED")
  })
})
