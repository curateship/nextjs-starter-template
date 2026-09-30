import { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { RepeatRule } from "@/lib/events/event-repeat"
import { createCategory } from "@/server/directory/categories"
import { categoryIdsFor } from "@/server/directory/content-categories"
import { directoryFeaturedEntitlements } from "@/server/directory/schema"
import {
  createEvent,
  findEvent,
  setEventsFeatured,
  setEventsStatus,
  type SiteEvent,
} from "@/server/events/events"
import {
  changeEventsAndDates,
  saveEventAndDates,
} from "@/server/events/repeats"
import { siteEvents, EVENT_CONTENT_TYPE } from "@/server/events/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Changing many events at once. Two things are only true of events: the future
 * dates of a repeating event follow their main event, and featuring is a free
 * admin switch that must never reach a listing owner's paid placement.
 *
 * "Now" is noon on Wednesday 23 September 2026, Toronto time.
 */

let client: PGlite
let database: TestDatabase
let site: string

const september23 = new Date("2026-09-23T16:00:00Z")
const thursdays: RepeatRule = { freq: "weekly", weekdays: [4], until: null }

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  site = (await insertWorkspace(database, { name: "Alpha" })).id
})

afterEach(async () => {
  await client.close()
})

/** A plain one-off event on Thursday 1 October, left as a draft. */
async function oneOff(title: string): Promise<SiteEvent> {
  return createEvent(
    site,
    { title, when: { startDate: "2026-10-01", startTime: "19:00" } },
    database
  )
}

/** A trivia night that repeats every Thursday, published, with its dates made. */
async function repeatingTrivia(): Promise<SiteEvent> {
  const made = await oneOff("Trivia night")
  const { event } = await saveEventAndDates(
    site,
    made.id,
    { status: "published", repeat: thursdays },
    database,
    september23
  )
  return event
}

async function datesOf(mainId: string) {
  return database
    .select()
    .from(siteEvents)
    .where(eq(siteEvents.seriesId, mainId))
    .orderBy(asc(siteEvents.seriesDate))
}

describe("publishing many events at once", () => {
  it("publishes the drafts and counts the ones already live", async () => {
    const draft = await oneOff("Quiz night")
    const live = await repeatingTrivia()

    const result = await setEventsStatus(
      site,
      [draft.id, live.id],
      "published",
      database
    )
    expect(result.done).toEqual([draft.id])
    expect(result.same).toEqual([live.id])
  })

  it("refuses one date of a repeat, because the dashboard lists main events", async () => {
    const main = await repeatingTrivia()
    const [firstDate] = await datesOf(main.id)

    const result = await setEventsStatus(
      site,
      [firstDate!.id],
      "draft",
      database
    )
    expect(result.done).toEqual([])
    expect(result.kept.map((refusal) => refusal.id)).toEqual([firstDate!.id])
  })
})

describe("the change and its dates go together or not at all", () => {
  it("carries an unpublish onto the future dates of a repeating event", async () => {
    const main = await repeatingTrivia()
    expect(
      (await datesOf(main.id)).every((date) => date.status === "published")
    ).toBe(true)

    const result = await changeEventsAndDates(
      site,
      [main.id],
      { kind: "status", status: "draft" },
      database,
      september23
    )

    expect(result.done).toEqual([main.id])
    expect((await findEvent(site, main.id, database))?.status).toBe("draft")
    const dates = await datesOf(main.id)
    expect(dates).not.toHaveLength(0)
    expect(dates.every((date) => date.status === "draft")).toBe(true)
  })

  it("leaves the events untouched when copying onto the dates fails", async () => {
    const main = await repeatingTrivia()
    // An unreadable clock makes the copy fail *after* the status has been
    // written, which is the half-done state this has to rule out. Without the
    // transaction the main event would be a draft and its dates still published,
    // and pressing the button again would not repair it.
    await expect(
      changeEventsAndDates(
        site,
        [main.id],
        { kind: "status", status: "draft" },
        database,
        new Date("not a date")
      )
    ).rejects.toThrow()

    expect((await findEvent(site, main.id, database))?.status).toBe("published")
    const dates = await datesOf(main.id)
    expect(dates).not.toHaveLength(0)
    expect(dates.every((date) => date.status === "published")).toBe(true)
  })
})

describe("filing many events under one category", () => {
  it("carries the filing onto the future dates", async () => {
    const cafes = await createCategory(site, { name: "Cafés" }, database)
    const main = await repeatingTrivia()

    await changeEventsAndDates(
      site,
      [main.id],
      { kind: "category", categoryId: cafes.id, mode: "add" },
      database,
      september23
    )

    expect(
      await categoryIdsFor(site, EVENT_CONTENT_TYPE, main.id, database)
    ).toEqual([cafes.id])
    for (const date of await datesOf(main.id)) {
      expect(
        await categoryIdsFor(site, EVENT_CONTENT_TYPE, date.id, database)
      ).toEqual([cafes.id])
    }
  })
})

describe("the free featured switch", () => {
  it("switches it on and counts an event that already had it", async () => {
    const first = await oneOff("Quiz night")
    const second = await oneOff("Open mic")
    await setEventsFeatured(site, [first.id], true, database)

    const result = await setEventsFeatured(
      site,
      [first.id, second.id],
      true,
      database
    )
    expect(result.same).toEqual([first.id])
    expect(result.done).toEqual([second.id])
  })

  it("creates and ends no paid placement", async () => {
    const event = await oneOff("Quiz night")
    await setEventsFeatured(site, [event.id], true, database)
    await setEventsFeatured(site, [event.id], false, database)

    const entitlements = await database
      .select()
      .from(directoryFeaturedEntitlements)
    expect(entitlements).toEqual([])
  })
})
