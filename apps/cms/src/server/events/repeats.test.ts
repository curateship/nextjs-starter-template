import { PGlite } from "@electric-sql/pglite"
import { and, asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { RepeatRule } from "@/lib/events/event-repeat"
import { createCategory } from "@/server/directory/categories"
import { categoryIdsFor } from "@/server/directory/content-categories"
import { categoryRelationships } from "@/server/directory/schema"
import {
  createEvent,
  deleteEvents,
  listEvents,
  seriesForEdit,
  type SiteEvent,
} from "@/server/events/events"
import {
  saveEventAndDates,
  topUpEverySeries,
  topUpSeries,
} from "@/server/events/repeats"
import { siteEvents, EVENT_CONTENT_TYPE } from "@/server/events/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * A repeating event: the main event is the first date, and the rule makes the
 * rest ahead of time. The site is on Toronto time, and "now" is noon on
 * Wednesday 23 September 2026 unless a test moves it.
 */

let client: PGlite
let database: TestDatabase
let siteId: string

const september23 = new Date("2026-09-23T16:00:00Z")
const thursdays: RepeatRule = { freq: "weekly", weekdays: [4], until: null }

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
})

afterEach(async () => {
  await client.close()
})

/** A trivia night on Thursday 1 October, 7pm to 10pm, saved with a repeat. */
async function trivia(
  repeat: RepeatRule = thursdays,
  at: Date = september23
): Promise<SiteEvent> {
  const made = await createEvent(
    siteId,
    {
      title: "Trivia night",
      when: {
        startDate: "2026-10-01",
        startTime: "19:00",
        endTime: "22:00",
      },
    },
    database
  )
  const { event } = await saveEventAndDates(
    siteId,
    made.id,
    { status: "published", placeName: "The Local", repeat },
    database,
    at
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

describe("making the dates", () => {
  it("keeps the next 8 dates, counting the main event", async () => {
    const main = await trivia()
    const dates = await datesOf(main.id)

    expect(dates.map((date) => date.startDate)).toEqual([
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
      "2026-10-29",
      "2026-11-05",
      "2026-11-12",
      "2026-11-19",
    ])
    const first = dates[0]!
    expect(first.slug).toBe("trivia-night-2026-10-08")
    expect(first.title).toBe("Trivia night")
    expect(first.status).toBe("published")
    expect(first.publishedAt).not.toBeNull()
    expect(first.placeName).toBe("The Local")
    expect(first.startTime).toBe("19:00:00")
    expect(first.endDate).toBe("2026-10-08")
    expect(first.endTime).toBe("22:00:00")
  })

  it("never makes a date twice, however often the job runs", async () => {
    const main = await trivia()
    expect(await topUpEverySeries(database, september23)).toBe(0)
    const [row] = await database
      .select()
      .from(siteEvents)
      .where(eq(siteEvents.id, main.id))
    // Two runs at the same moment, both sure the dates are missing.
    await database
      .delete(siteEvents)
      .where(eq(siteEvents.seriesId, main.id))
    await Promise.all([
      topUpSeries({ ...row!, repeatMadeUntil: null }, "2026-09-23", database),
      topUpSeries({ ...row!, repeatMadeUntil: null }, "2026-09-23", database),
    ])
    expect(await datesOf(main.id)).toHaveLength(7)
  })

  it("tops up as the days pass, and never makes a past date", async () => {
    const main = await trivia()
    // Monday 26 October: four dates have gone, so four more are due.
    const made = await topUpEverySeries(
      database,
      new Date("2026-10-26T16:00:00Z")
    )
    expect(made).toBe(4)
    const days = (await datesOf(main.id)).map((date) => date.startDate)
    expect(days.at(-1)).toBe("2026-12-17")
    expect(days.filter((day) => day >= "2026-10-26")).toHaveLength(8)
  })

  it("stops 3 months ahead, so a monthly event keeps fewer", async () => {
    const main = await trivia({
      freq: "monthly",
      week: 1,
      weekday: 4,
      until: null,
    })
    // 3 months from 23 Sep is 23 Dec: the first Thursdays of Nov and Dec.
    expect((await datesOf(main.id)).map((date) => date.startDate)).toEqual([
      "2026-11-05",
      "2026-12-03",
    ])
  })

  it("stops on the repeat's end day", async () => {
    const main = await trivia({ ...thursdays, until: "2026-10-22" })
    expect((await datesOf(main.id)).map((date) => date.startDate)).toEqual([
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
    ])
  })

  it("never makes a deleted date again, and makes the next one instead", async () => {
    const main = await trivia()
    const dates = await datesOf(main.id)
    await deleteEvents(siteId, [dates.at(-1)!.id], database)
    // 19 Nov is gone, so 26 Nov keeps the count at 8.
    expect(await topUpEverySeries(database, september23)).toBe(1)
    const days = (await datesOf(main.id)).map((date) => date.startDate)
    expect(days).not.toContain("2026-11-19")
    expect(days.at(-1)).toBe("2026-11-26")
  })

  it("files every date under the main event's categories", async () => {
    const quiz = await createCategory(siteId, { name: "Quiz" }, database)
    const made = await createEvent(
      siteId,
      { title: "Trivia night", when: { startDate: "2026-10-01", startTime: "19:00" } },
      database
    )
    await saveEventAndDates(
      siteId,
      made.id,
      { categoryIds: [quiz.id], repeat: thursdays },
      database,
      september23
    )
    const [date] = await datesOf(made.id)
    expect(
      await categoryIdsFor(siteId, EVENT_CONTENT_TYPE, date!.id, database)
    ).toEqual([quiz.id])
  })
})

describe("editing", () => {
  it("copies a change to the main event onto future dates, and skips one saved by itself", async () => {
    const main = await trivia()
    const [halloween, ...rest] = (await datesOf(main.id)).filter(
      (date) => date.startDate === "2026-10-29" || date.startDate > "2026-10-29"
    )
    await saveEventAndDates(
      siteId,
      halloween!.id,
      { title: "Halloween trivia" },
      database,
      september23
    )

    await saveEventAndDates(
      siteId,
      main.id,
      {
        title: "Pub quiz",
        placeName: "The Other Local",
        when: { startDate: "2026-10-01", startTime: "20:00" },
      },
      database,
      september23
    )

    const after = await datesOf(main.id)
    const byDay = new Map(after.map((date) => [date.startDate, date]))
    expect(byDay.get("2026-10-29")?.title).toBe("Halloween trivia")
    expect(byDay.get("2026-10-29")?.placeName).toBe("The Local")
    for (const date of rest) {
      const now = byDay.get(date.startDate)!
      expect(now.title).toBe("Pub quiz")
      expect(now.placeName).toBe("The Other Local")
      expect(now.startTime).toBe("20:00:00")
      expect(now.endDate).toBeNull()
      // The same date, with the same address, not a new one.
      expect(now.id).toBe(date.id)
      expect(now.slug).toBe(date.slug)
    }
  })

  it("leaves the other dates alone when one date is edited", async () => {
    const main = await trivia()
    const [first, second] = await datesOf(main.id)
    await saveEventAndDates(
      siteId,
      first!.id,
      { title: "Trivia night: finals" },
      database,
      september23
    )
    const [firstAfter, secondAfter] = await datesOf(main.id)
    expect(firstAfter!.title).toBe("Trivia night: finals")
    expect(firstAfter!.editedAlone).toBe(true)
    expect(secondAfter!.title).toBe(second!.title)
    expect(secondAfter!.editedAlone).toBe(false)
    const [mainAfter] = await database
      .select()
      .from(siteEvents)
      .where(eq(siteEvents.id, main.id))
    expect(mainAfter!.title).toBe("Trivia night")
  })

  it("leaves dates that are already past alone", async () => {
    const main = await trivia()
    await saveEventAndDates(
      siteId,
      main.id,
      { title: "Pub quiz" },
      database,
      new Date("2026-10-20T16:00:00Z")
    )
    const titles = new Map(
      (await datesOf(main.id)).map((date) => [date.startDate, date.title])
    )
    expect(titles.get("2026-10-15")).toBe("Trivia night")
    expect(titles.get("2026-10-22")).toBe("Pub quiz")
  })

  it("makes the dates again for a new rule, and keeps and names one saved by itself", async () => {
    const main = await trivia()
    const halloween = (await datesOf(main.id)).find(
      (date) => date.startDate === "2026-10-29"
    )!
    await saveEventAndDates(
      siteId,
      halloween.id,
      { title: "Halloween trivia" },
      database,
      september23
    )

    const { keptDates } = await saveEventAndDates(
      siteId,
      main.id,
      { repeat: { freq: "weekly", weekdays: [2, 4], until: null } },
      database,
      september23
    )
    expect(keptDates).toEqual(["2026-10-29"])
    const days = (await datesOf(main.id)).map((date) => date.startDate)
    expect(days).toEqual([
      "2026-10-06",
      "2026-10-08",
      "2026-10-13",
      "2026-10-15",
      "2026-10-20",
      "2026-10-22",
      "2026-10-29",
    ])
  })

  it("clears the future dates when the repeat is stopped, and keeps the rest", async () => {
    const main = await trivia()
    const kept = (await datesOf(main.id))[2]!
    await saveEventAndDates(
      siteId,
      kept.id,
      { summary: "Bring a team of four." },
      database,
      september23
    )
    const { keptDates } = await saveEventAndDates(
      siteId,
      main.id,
      { repeat: null },
      database,
      september23
    )
    expect(keptDates).toEqual([kept.startDate])
    expect((await datesOf(main.id)).map((date) => date.id)).toEqual([kept.id])
    expect(await topUpEverySeries(database, september23)).toBe(0)
  })

  it("refuses a repeat that misses the start day, and saves nothing", async () => {
    const main = await trivia()
    await expect(
      saveEventAndDates(
        siteId,
        main.id,
        {
          title: "Renamed",
          repeat: { freq: "weekly", weekdays: [5], until: null },
        },
        database,
        september23
      )
    ).rejects.toThrow('"Every Friday" never falls on it')
    const [row] = await database
      .select()
      .from(siteEvents)
      .where(eq(siteEvents.id, main.id))
    expect(row!.title).toBe("Trivia night")
    expect(await datesOf(main.id)).toHaveLength(7)
  })

  it("refuses a repeat on one date of a repeating event", async () => {
    const main = await trivia()
    const [date] = await datesOf(main.id)
    await expect(
      saveEventAndDates(
        siteId,
        date!.id,
        { repeat: thursdays },
        database,
        september23
      )
    ).rejects.toThrow("Change the repeat on the main event.")
  })
})

describe("the admin's list and window", () => {
  it("shows a repeating event once, with its dates counted", async () => {
    const main = await trivia()
    const { events, total } = await listEvents(siteId, {}, database)
    expect(total).toBe(1)
    expect(events[0]?.id).toBe(main.id)
    expect(events[0]?.repeat).toEqual(thursdays)
    expect(events[0]?.seriesDates.total).toBe(7)
  })

  it("lists a main event's dates, and names the main event on a date", async () => {
    const main = await trivia()
    const series = await seriesForEdit(siteId, main, database)
    expect(series.dates).toHaveLength(7)
    expect(series.dates[0]).toMatchObject({
      startDate: "2026-10-08",
      startTime: "19:00",
      status: "published",
      editedAlone: false,
    })

    const [row] = await datesOf(main.id)
    const dateSeries = await seriesForEdit(
      siteId,
      { ...main, id: row!.id, seriesId: main.id },
      database
    )
    expect(dateSeries.main).toEqual({ id: main.id, title: "Trivia night" })
  })

  it("deletes every date, and their categories, with the main event", async () => {
    const quiz = await createCategory(siteId, { name: "Quiz" }, database)
    const made = await createEvent(
      siteId,
      { title: "Trivia night", when: { startDate: "2026-10-01", startTime: "19:00" } },
      database
    )
    await saveEventAndDates(
      siteId,
      made.id,
      { categoryIds: [quiz.id], repeat: thursdays },
      database,
      september23
    )

    const { done } = await deleteEvents(siteId, [made.id], database)
    expect(done).toEqual([made.id])
    expect(await database.select().from(siteEvents)).toEqual([])
    expect(
      await database
        .select()
        .from(categoryRelationships)
        .where(
          and(
            eq(categoryRelationships.workspaceId, siteId),
            eq(categoryRelationships.contentType, EVENT_CONTENT_TYPE)
          )
        )
    ).toEqual([])
  })
})
