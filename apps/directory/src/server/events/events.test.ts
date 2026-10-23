import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  categoryDeleteImpact,
  createCategory,
  deleteCategory,
} from "@/server/directory/categories"
import {
  categoryIdsFor,
  setContentCategories,
} from "@/server/directory/content-categories"
import { categoryRelationships } from "@/server/directory/schema"
import {
  saveDirectoryTimeZone,
  siteTimeZone,
} from "@/server/directory/settings"
import {
  cleanEventWhen,
  createEvent,
  deleteEvents,
  duplicateEvent,
  findEvent,
  listEvents,
  updateEvent,
  type EventWhenInput,
} from "@/server/events/events"
import { siteEvents, EVENT_CONTENT_TYPE } from "@/server/events/schema"
import { customShellWorkspaces } from "@/server/schema"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The admin's promises about events: one address per event on a site, a day
 * and a clock time stored as typed, an end never before the start, one site
 * never sees another's events, and a category's delete warning counts them.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

const saturday = { startDate: "2026-09-26", startTime: "18:00" }

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  await client.close()
})

function make(site: string, title: string, when: EventWhenInput = saturday) {
  return createEvent(site, { title, when }, database)
}

describe("addresses", () => {
  it("are unique per site, numbered when derived and refused when picked", async () => {
    const first = await make(alpha, "Night market")
    const second = await make(alpha, "Night market")
    const elsewhere = await make(beta, "Night market")

    expect(first.slug).toBe("night-market")
    expect(second.slug).toBe("night-market-2")
    expect(elsewhere.slug).toBe("night-market")
    await expect(
      createEvent(
        alpha,
        { title: "Other", slug: "night-market", when: saturday },
        database
      )
    ).rejects.toThrow("Another event already uses the address night-market")
    await expect(
      updateEvent(alpha, second.id, { slug: "night-market" }, database)
    ).rejects.toThrow("Another event already uses the address night-market")
  })
})

describe("when it happens", () => {
  it("stores the day and clock time as typed", async () => {
    const event = await createEvent(
      alpha,
      {
        title: "Night market",
        when: { ...saturday, endTime: "23:00" },
      },
      database
    )
    expect(event).toMatchObject({
      startDate: "2026-09-26",
      startTime: "18:00",
      endDate: "2026-09-26",
      endTime: "23:00",
    })
  })

  it("stores no end when none is given", () => {
    expect(cleanEventWhen({ ...saturday, endDate: "", endTime: "" })).toEqual({
      ...saturday,
      endDate: null,
      endTime: null,
    })
    expect(
      cleanEventWhen({ ...saturday, endDate: "2026-09-26", endTime: null })
    ).toEqual({ ...saturday, endDate: null, endTime: null })
  })

  it("refuses an end before the start, and a missing or unreal start", () => {
    expect(() => cleanEventWhen({ ...saturday, endTime: "17:00" })).toThrow(
      "The event ends before it starts."
    )
    expect(() => cleanEventWhen({ ...saturday, endTime: "18:00" })).toThrow(
      "The event ends before it starts."
    )
    expect(() =>
      cleanEventWhen({ ...saturday, endDate: "2026-09-25" })
    ).toThrow("The event ends before it starts.")
    expect(() => cleanEventWhen({ startDate: "", startTime: "18:00" })).toThrow(
      "Pick the day the event starts."
    )
    expect(() =>
      cleanEventWhen({ startDate: "2026-02-30", startTime: "18:00" })
    ).toThrow("Pick the day the event starts.")
    expect(() =>
      cleanEventWhen({ startDate: "2026-09-26", startTime: "" })
    ).toThrow("Give the time the event starts.")
  })

  it("lets an event run past midnight into the next day", () => {
    expect(
      cleanEventWhen({
        startDate: "2026-09-26",
        startTime: "22:00",
        endDate: "2026-09-27",
        endTime: "02:00",
      })
    ).toEqual({
      startDate: "2026-09-26",
      startTime: "22:00",
      endDate: "2026-09-27",
      endTime: "02:00",
    })
  })

  it("keeps the database from holding an end before the start", async () => {
    const event = await make(alpha, "Checked")
    await expect(
      database
        .update(siteEvents)
        .set({ endDate: "2026-09-26", endTime: "17:00" })
        .where(eq(siteEvents.id, event.id))
    ).rejects.toThrow()
  })
})

describe("publishing", () => {
  it("starts as an undated draft, dates the first publish and keeps that date", async () => {
    const event = await make(alpha, "Dated")
    expect(event.status).toBe("draft")
    expect(event.publishedAt).toBeNull()

    const published = await updateEvent(
      alpha,
      event.id,
      { status: "published" },
      database
    )
    expect(published.publishedAt).toBeInstanceOf(Date)

    const unpublished = await updateEvent(
      alpha,
      event.id,
      { status: "draft" },
      database
    )
    expect(unpublished.status).toBe("draft")
    const again = await updateEvent(
      alpha,
      event.id,
      { status: "published" },
      database
    )
    expect(again.publishedAt?.getTime()).toBe(published.publishedAt?.getTime())
  })
})

describe("duplicating", () => {
  it("copies as a draft with a new address and leaves the original alone", async () => {
    const food = await createCategory(alpha, { name: "Food" }, database)
    const original = await make(alpha, "Trivia Night", {
      startDate: "2026-09-24",
      startTime: "19:00",
      endDate: "2026-09-24",
      endTime: "22:00",
    })
    await updateEvent(
      alpha,
      original.id,
      {
        status: "published",
        summary: "Six rounds.",
        coverImage: "https://images.example/trivia.jpg",
        placeName: "The Local",
        placeAddress: "1 King St W",
      },
      database
    )
    await setContentCategories(
      alpha,
      EVENT_CONTENT_TYPE,
      original.id,
      [food.id],
      database
    )
    const before = await findEvent(alpha, original.id, database)

    const copy = await duplicateEvent(alpha, original.id, database)
    expect(copy.id).not.toBe(original.id)
    expect(copy.title).toBe("Trivia Night (copy)")
    expect(copy.slug).toBe("trivia-night-copy")
    expect(copy.status).toBe("draft")
    expect(copy.publishedAt).toBeNull()
    expect(copy).toMatchObject({
      summary: "Six rounds.",
      coverImage: "https://images.example/trivia.jpg",
      placeName: "The Local",
      placeAddress: "1 King St W",
      startDate: "2026-09-24",
      startTime: "19:00",
      endDate: "2026-09-24",
      endTime: "22:00",
    })
    expect(
      await categoryIdsFor(alpha, EVENT_CONTENT_TYPE, copy.id, database)
    ).toEqual([food.id])
    expect(await findEvent(alpha, original.id, database)).toEqual(before)

    // A second copy of the same event gets the next free address.
    expect((await duplicateEvent(alpha, original.id, database)).slug).toBe(
      "trivia-night-copy-2"
    )
  })

  it('keeps "(copy)" on a title already at the limit', async () => {
    const long = await make(alpha, "x".repeat(200))
    const copy = await duplicateEvent(alpha, long.id, database)
    expect(copy.title).toHaveLength(200)
    expect(copy.title.endsWith(" (copy)")).toBe(true)
  })

  it("will not copy another site's event, or one that is gone", async () => {
    const theirs = await make(beta, "Beta's")
    await expect(duplicateEvent(alpha, theirs.id, database)).rejects.toThrow(
      "no longer exists"
    )
    await deleteEvents(beta, [theirs.id], database)
    await expect(duplicateEvent(beta, theirs.id, database)).rejects.toThrow(
      "no longer exists"
    )
  })
})

describe("one site's events", () => {
  it("lists only this site's events, newest date first, with search and the status filter", async () => {
    const early = await make(alpha, "Early market", {
      startDate: "2026-09-01",
      startTime: "10:00",
    })
    const late = await make(alpha, "Late market", {
      startDate: "2026-10-01",
      startTime: "10:00",
    })
    await updateEvent(
      alpha,
      late.id,
      { status: "published", placeName: "Trinity Bellwoods" },
      database
    )
    await make(beta, "Beta market")

    const all = await listEvents(alpha, {}, database)
    expect(all.total).toBe(2)
    expect(all.events.map((event) => event.id)).toEqual([late.id, early.id])
    expect(
      (await listEvents(alpha, { sort: "date", direction: "asc" }, database))
        .events[0]?.id
    ).toBe(early.id)
    expect(
      (await listEvents(alpha, { search: "bellwoods" }, database)).events.map(
        (event) => event.id
      )
    ).toEqual([late.id])
    expect(
      (await listEvents(alpha, { status: "draft" }, database)).events.map(
        (event) => event.id
      )
    ).toEqual([early.id])
    expect(await findEvent(beta, late.id, database)).toBeNull()
    await expect(
      updateEvent(beta, late.id, { title: "Taken over" }, database)
    ).rejects.toThrow("That event no longer exists.")
  })

  it("sorts each column the way its arrow says when no direction is given", async () => {
    await make(alpha, "Beta night")
    await make(alpha, "Alpha night")
    expect(
      (await listEvents(alpha, { sort: "title" }, database)).events.map(
        (event) => event.title
      )
    ).toEqual(["Alpha night", "Beta night"])
  })

  it("goes when its site is deleted", async () => {
    await make(alpha, "Gone with the site")
    await database
      .delete(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, alpha))
    expect(await database.select().from(siteEvents)).toEqual([])
  })

  it("will not delete another site's event", async () => {
    const event = await make(beta, "Beta's")
    expect(await deleteEvents(alpha, [event.id], database)).toEqual({
      done: [],
      kept: [event.id],
    })
    expect(await findEvent(beta, event.id, database)).not.toBeNull()
  })
})

describe("categories", () => {
  it("files an event under this site's categories and shows them on its row", async () => {
    const event = await make(alpha, "Filed")
    const mine = await createCategory(alpha, { name: "Markets" }, database)
    const theirs = await createCategory(beta, { name: "Cafes" }, database)

    await setContentCategories(
      alpha,
      EVENT_CONTENT_TYPE,
      event.id,
      [mine.id, theirs.id],
      database
    )
    expect(
      await categoryIdsFor(alpha, EVENT_CONTENT_TYPE, event.id, database)
    ).toEqual([mine.id])
    expect(
      (await listEvents(alpha, {}, database)).events[0]?.categories
    ).toEqual(["Markets"])
  })

  it("are counted separately in a category's delete warning, and lose the tag with it", async () => {
    const markets = await createCategory(alpha, { name: "Markets" }, database)
    const event = await make(alpha, "Night market")
    await setContentCategories(
      alpha,
      EVENT_CONTENT_TYPE,
      event.id,
      [markets.id],
      database
    )

    expect(await categoryDeleteImpact(alpha, markets.id, database)).toEqual({
      children: 0,
      listings: 0,
      posts: 0,
      events: 1,
    })
    await deleteCategory(alpha, markets.id, database)
    expect(
      await categoryIdsFor(alpha, EVENT_CONTENT_TYPE, event.id, database)
    ).toEqual([])
    expect(await findEvent(alpha, event.id, database)).not.toBeNull()
  })

  it("removes a deleted event's category rows with it", async () => {
    const markets = await createCategory(alpha, { name: "Markets" }, database)
    const event = await make(alpha, "Short lived")
    await setContentCategories(
      alpha,
      EVENT_CONTENT_TYPE,
      event.id,
      [markets.id],
      database
    )

    expect(await deleteEvents(alpha, [event.id, "missing"], database)).toEqual({
      done: [event.id],
      kept: ["missing"],
    })
    expect(
      await database
        .select()
        .from(categoryRelationships)
        .where(eq(categoryRelationships.contentType, EVENT_CONTENT_TYPE))
    ).toEqual([])
  })
})

describe("the site's time zone", () => {
  it("starts on Toronto time and keeps a real zone it is given", async () => {
    expect(await siteTimeZone(alpha, database)).toBe("America/Toronto")
    await saveDirectoryTimeZone(alpha, "Europe/London", database)
    expect(await siteTimeZone(alpha, database)).toBe("Europe/London")
    expect(await siteTimeZone(beta, database)).toBe("America/Toronto")
    await expect(
      saveDirectoryTimeZone(alpha, "Mars/Olympus_Mons", database)
    ).rejects.toThrow("Choose a time zone from the list.")
  })
})
